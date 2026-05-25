/**
 * VALVET — Controller: Autenticação
 */

const bcrypt  = require('bcrypt')
const jwt     = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')
const { validationResult } = require('express-validator')
const { writeLoginLog }    = require('../services/logService')
const { validateCode }     = require('../services/codeService')

const prisma = new PrismaClient()

// Armazenamento simples de refresh tokens (produção: usar Redis)
const refreshTokenStore = new Set()

function issueTokens(userId, username) {
  const accessToken = jwt.sign(
    { userId, username },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  )
  const refreshToken = jwt.sign(
    { userId, username },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  )
  return { accessToken, refreshToken }
}

function setRefreshCookie(res, token) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure:   process.env.COOKIE_SECURE === 'true',
    sameSite: process.env.COOKIE_SAMESITE || 'strict',
    maxAge:   7 * 24 * 60 * 60 * 1000,
  })
}

// ── Register ──────────────────────────────────────────────────────
exports.register = async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() })
  }

  const { username, password, accessCode } = req.body

  try {
    // Validar código de acesso
    const { valid, reason, record } = await validateCode(accessCode)
    if (!valid) return res.status(400).json({ error: reason })

    // Verificar username duplicado
    const existing = await prisma.user.findUnique({ where: { username } })
    if (existing) return res.status(400).json({ error: 'Username já em uso' })

    // Criar usuário
    const passwordHash = await bcrypt.hash(password, 12)
    await prisma.user.create({ data: { username, passwordHash } })

    // Marcar código como usado
    await prisma.accessCode.update({
      where: { id: record.id },
      data:  { usedAt: new Date() },
    })

    res.status(201).json({ message: 'Conta criada com sucesso' })
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error(err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
}

// ── Login ─────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Credenciais inválidas' })
  }

  const { username, password } = req.body
  const ip        = req.ip || 'unknown'
  const userAgent = req.headers['user-agent'] || 'unknown'

  try {
    const user = await prisma.user.findUnique({ where: { username } })

    if (!user) {
      await writeLoginLog({ username, ip, userAgent, status: 'FAILURE', reason: 'USER_NOT_FOUND' })
      return res.status(401).json({ error: 'Credenciais inválidas' })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      await writeLoginLog({ userId: user.id, username, ip, userAgent, status: 'FAILURE', reason: 'INVALID_PASSWORD' })
      return res.status(401).json({ error: 'Credenciais inválidas' })
    }

    await writeLoginLog({ userId: user.id, username, ip, userAgent, status: 'SUCCESS' })

    const { accessToken, refreshToken } = issueTokens(user.id, user.username)
    refreshTokenStore.add(refreshToken)
    setRefreshCookie(res, refreshToken)

    res.json({
      accessToken,
      user: { id: user.id, username: user.username, isAdmin: user.isAdmin },
    })
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error(err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
}

// ── Refresh ───────────────────────────────────────────────────────
exports.refresh = async (req, res) => {
  const token = req.cookies?.refreshToken
  if (!token) return res.status(401).json({ error: 'Refresh token ausente' })

  try {
    const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET)

    // Rotação: invalidar token usado e emitir novo par
    refreshTokenStore.delete(token)

    const { accessToken, refreshToken: newRefresh } = issueTokens(payload.userId, payload.username)
    refreshTokenStore.add(newRefresh)
    setRefreshCookie(res, newRefresh)

    res.json({ accessToken })
  } catch {
    res.clearCookie('refreshToken')
    res.status(401).json({ error: 'Refresh token inválido ou expirado' })
  }
}

// ── Logout ────────────────────────────────────────────────────────
exports.logout = (req, res) => {
  const token = req.cookies?.refreshToken
  if (token) refreshTokenStore.delete(token)

  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure:   process.env.COOKIE_SECURE === 'true',
    sameSite: process.env.COOKIE_SAMESITE || 'strict',
  })

  res.json({ message: 'Logout realizado' })
}
