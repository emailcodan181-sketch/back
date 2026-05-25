/**
 * VALVET — Controller: Painel Admin
 */

const { PrismaClient } = require('@prisma/client')
const { createCode, listCodes, revokeCode } = require('../services/codeService')

const prisma = new PrismaClient()

// ── Métricas ──────────────────────────────────────────────────────
exports.getMetrics = async (req, res) => {
  try {
    const now      = new Date()
    const since24h = new Date(now - 24 * 60 * 60 * 1000)

    const [totalUsers, allCodes, logsLast24h] = await Promise.all([
      prisma.user.count(),
      prisma.accessCode.findMany(),
      prisma.loginLog.findMany({ where: { createdAt: { gte: since24h } } }),
    ])

    const codeStats = allCodes.reduce((acc, c) => {
      if (c.usedAt) acc.usados++
      else if (new Date(c.expiresAt) <= now) acc.expirados++
      else acc.ativos++
      return acc
    }, { ativos: 0, usados: 0, expirados: 0 })

    const loginStats = logsLast24h.reduce((acc, l) => {
      if (l.status === 'SUCCESS') acc.sucessos++
      else acc.falhas++
      return acc
    }, { sucessos: 0, falhas: 0 })

    const total = loginStats.sucessos + loginStats.falhas
    const failRate = total > 0 ? ((loginStats.falhas / total) * 100).toFixed(1) : '0.0'

    res.json({
      totalUsers,
      codes:      codeStats,
      logins24h:  { ...loginStats, total, failRate: `${failRate}%` },
    })
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error(err)
    res.status(500).json({ error: 'Erro ao buscar métricas' })
  }
}

// ── Códigos de acesso ─────────────────────────────────────────────
exports.getCodes = async (req, res) => {
  try {
    const codes = await listCodes()
    res.json({ codes })
  } catch {
    res.status(500).json({ error: 'Erro ao listar códigos' })
  }
}

exports.generateCode = async (req, res) => {
  try {
    const code = await createCode(req.user.userId)
    res.status(201).json({
      message:  'Código gerado com sucesso',
      code:     code.fullCode,  // exibido apenas uma vez
      id:       code.id,
      expiresAt: code.expiresAt,
    })
  } catch {
    res.status(500).json({ error: 'Erro ao gerar código' })
  }
}

exports.revokeCode = async (req, res) => {
  try {
    await revokeCode(req.params.id)
    res.json({ message: 'Código revogado' })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
}

// ── Logs de segurança ─────────────────────────────────────────────
exports.getLogs = async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page)  || 1)
  const limit  = Math.min(100, parseInt(req.query.limit) || 50)
  const skip   = (page - 1) * limit
  const status = req.query.status  // "SUCCESS" | "FAILURE"
  const search = req.query.search  // busca por IP ou username
  const from   = req.query.from
  const to     = req.query.to

  const where = {}
  if (status) where.status = status
  if (from || to) {
    where.createdAt = {}
    if (from) where.createdAt.gte = new Date(from)
    if (to)   where.createdAt.lte = new Date(to)
  }
  if (search) {
    where.OR = [
      { ip:       { contains: search } },
      { username: { contains: search } },
    ]
  }

  try {
    const [logs, total] = await Promise.all([
      prisma.loginLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true, username: true, ip: true, userAgent: true,
          status: true, reason: true, createdAt: true,
        },
      }),
      prisma.loginLog.count({ where }),
    ])

    res.json({
      logs: logs.map(l => ({ ...l, userAgent: l.userAgent.slice(0, 60) })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  } catch {
    res.status(500).json({ error: 'Erro ao buscar logs' })
  }
}

// ── Listar usuários ───────────────────────────────────────────────
exports.getUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, isAdmin: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ users })
  } catch {
    res.status(500).json({ error: 'Erro ao buscar usuários' })
  }
}

// ── Promover usuário a admin ──────────────────────────────────────
exports.promoteUser = async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data:  { isAdmin: true },
      select: { id: true, username: true, isAdmin: true },
    })
    res.json({ message: 'Usuário promovido a admin', user })
  } catch {
    res.status(404).json({ error: 'Usuário não encontrado' })
  }
}
