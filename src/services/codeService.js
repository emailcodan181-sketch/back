/**
 * VALVET — Service: Códigos de Acesso
 */

const crypto = require('crypto')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

function generateCode() {
  return crypto.randomBytes(32).toString('hex') // 64 chars hex
}

function maskCode(code) {
  return `${code.slice(0, 4)}...${code.slice(-4)}`
}

function getCodeStatus(code) {
  if (code.usedAt) return 'USADO'
  if (new Date(code.expiresAt) <= new Date()) return 'EXPIRADO'
  return 'ATIVO'
}

async function createCode(adminId) {
  const code      = generateCode()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

  const saved = await prisma.accessCode.create({
    data: { code, expiresAt, createdBy: adminId },
  })

  return { ...saved, status: 'ATIVO', fullCode: code }
}

async function listCodes() {
  const codes = await prisma.accessCode.findMany({
    orderBy: { createdAt: 'desc' },
  })

  return codes.map(c => ({
    id:        c.id,
    code:      maskCode(c.code),
    status:    getCodeStatus(c),
    createdAt: c.createdAt,
    expiresAt: c.expiresAt,
    usedAt:    c.usedAt,
    createdBy: c.createdBy,
  }))
}

async function revokeCode(id) {
  const code = await prisma.accessCode.findUnique({ where: { id } })
  if (!code) throw new Error('Código não encontrado')
  if (code.usedAt) throw new Error('Não é possível revogar um código já utilizado')

  await prisma.accessCode.delete({ where: { id } })
}

async function validateCode(codeStr) {
  const record = await prisma.accessCode.findUnique({ where: { code: codeStr } })
  if (!record) return { valid: false, reason: 'Código inválido' }
  if (record.usedAt) return { valid: false, reason: 'Código já utilizado' }
  if (new Date(record.expiresAt) <= new Date()) return { valid: false, reason: 'Código expirado' }
  return { valid: true, record }
}

module.exports = { createCode, listCodes, revokeCode, validateCode }
