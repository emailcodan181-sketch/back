/**
 * VALVET — Service: Log
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function writeLoginLog({ userId, username, ip, userAgent, status, reason }) {
  try {
    await prisma.loginLog.create({
      data: {
        userId:    userId || null,
        username:  username || 'unknown',
        ip:        ip || 'unknown',
        userAgent: (userAgent || 'unknown').slice(0, 500),
        status,
        reason:    reason || null,
      },
    })
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('writeLoginLog error:', err)
  }
}

async function writeRequestLog({ userId, conversationId, tokensUsed, latencyMs }) {
  try {
    await prisma.requestLog.create({
      data: { userId, conversationId: conversationId || null, tokensUsed, latencyMs },
    })
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('writeRequestLog error:', err)
  }
}

module.exports = { writeLoginLog, writeRequestLog }
