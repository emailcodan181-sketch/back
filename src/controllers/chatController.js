/**
 * VALVET — Controller: Chat com streaming SSE
 */

const { PrismaClient } = require('@prisma/client')
const { validationResult } = require('express-validator')
const { streamAI, detectJailbreak } = require('../services/aiService')
const { writeRequestLog }           = require('../services/logService')

const prisma = new PrismaClient()

// ── Enviar mensagem (SSE streaming) ───────────────────────────────
exports.sendMessage = async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

  const { messages, conversationId } = req.body
  const userId = req.user.userId
  const start  = Date.now()

  // Validar última mensagem do usuário
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
  if (!lastUserMsg) return res.status(400).json({ error: 'Nenhuma mensagem do usuário encontrada' })
  if (lastUserMsg.content.length > 2000) return res.status(400).json({ error: 'Mensagem muito longa (máx. 2000 chars)' })
  if (detectJailbreak(lastUserMsg.content)) return res.status(400).json({ error: 'Mensagem não permitida' })

  // Gerenciar conversa
  let convId = conversationId
  try {
    if (!convId) {
      // Criar nova conversa com título baseado na primeira mensagem
      const title = lastUserMsg.content.slice(0, 60).trim() || 'Nova conversa'
      const conv  = await prisma.conversation.create({ data: { userId, title } })
      convId = conv.id
    } else {
      // Verificar se a conversa pertence ao usuário
      const conv = await prisma.conversation.findFirst({ where: { id: convId, userId } })
      if (!conv) return res.status(403).json({ error: 'Conversa não encontrada' })
      // Atualizar updatedAt
      await prisma.conversation.update({ where: { id: convId }, data: { updatedAt: new Date() } })
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error(err)
    return res.status(500).json({ error: 'Erro ao gerenciar conversa' })
  }

  // Configurar SSE
  res.setHeader('Content-Type',  'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection',    'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // Nginx

  // Enviar conversationId para o cliente
  res.write(`data: ${JSON.stringify({ conversationId: convId })}\n\n`)

  try {
    const tokensUsed = await streamAI({ messages, res })
    const latencyMs  = Date.now() - start

    await writeRequestLog({ userId, conversationId: convId, tokensUsed, latencyMs })
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message || 'Erro na IA' })}\n\n`)
  } finally {
    res.end()
  }
}

// ── Listar conversas ──────────────────────────────────────────────
exports.getConversations = async (req, res) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where:   { userId: req.user.userId },
      orderBy: { updatedAt: 'desc' },
      take:    50,
      select:  { id: true, title: true, createdAt: true, updatedAt: true },
    })
    res.json({ conversations })
  } catch {
    res.status(500).json({ error: 'Erro ao buscar conversas' })
  }
}

// ── Deletar conversa ──────────────────────────────────────────────
exports.deleteConversation = async (req, res) => {
  const { id } = req.params
  try {
    const conv = await prisma.conversation.findFirst({ where: { id, userId: req.user.userId } })
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' })

    await prisma.conversation.delete({ where: { id } })
    res.json({ message: 'Conversa removida' })
  } catch {
    res.status(500).json({ error: 'Erro ao remover conversa' })
  }
}
