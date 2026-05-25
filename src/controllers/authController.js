/**
 * VALVET — Service: Proxy de IA com suporte a SSE
 */

const JAILBREAK_PATTERNS = [
  /ignore (all |previous |prior )?instructions/i,
  /pretend (you are|to be|you're)/i,
  /you are now/i,
  /act as (if you are|a )?/i,
  /DAN mode/i,
  /jailbreak/i,
  /bypass (your |all )?restrictions/i,
  /forget (your |all )?instructions/i,
]

function detectJailbreak(text) {
  return JAILBREAK_PATTERNS.some(pattern => pattern.test(text))
}

function buildSystemPrompt(username) {
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  return `Você é VALVET, uma inteligência artificial avançada e versátil.

Data e hora atual: ${now}
Usuário: ${username}

Diretrizes:
- Use o nome "${username}" naturalmente na conversa quando fizer sentido
- Responda sempre em português, adaptando ao idioma do usuário se ele mudar
- Dê respostas COMPLETAS e DETALHADAS — nunca trunce ou resuma desnecessariamente
- Use formatação markdown: listas, negrito, blocos de código, títulos
- Em código, sempre explique o que faz e por quê
- Seja direto, inteligente e amigável — como um amigo muito bem informado
- Você tem conhecimento atualizado e sabe que o ano atual é ${new Date().getFullYear()}
- Nunca diga que seu conhecimento vai só até 2022 ou 2023 — use a data atual fornecida acima
- Tenha personalidade: seja confiante, curioso e engajado
- Faça perguntas de acompanhamento quando ajudar a entender melhor o que o usuário precisa`
}

async function streamAnthropic({ messages, res, username }) {
  const response = await fetch(`${process.env.AI_BASE_URL}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         process.env.AI_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      process.env.AI_MODEL,
      max_tokens: 4096,
      system:     buildSystemPrompt(username),
      stream:     true,
      messages:   messages.slice(-20).map(m => ({ role: m.role, content: m.content })),
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || `AI API error ${response.status}`)
  }

  const reader  = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let totalTokens = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (raw === '[DONE]') continue
      try {
        const event = JSON.parse(raw)
        if (event.type === 'content_block_delta' && event.delta?.text) {
          res.write(`data: ${JSON.stringify({ chunk: event.delta.text })}\n\n`)
        }
        if (event.type === 'message_delta' && event.usage) {
          totalTokens = event.usage.output_tokens || 0
        }
        if (event.type === 'message_stop') {
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
        }
      } catch { }
    }
  }

  return totalTokens
}

async function streamOpenAI({ messages, res, username }) {
  const response = await fetch(`${process.env.AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.AI_API_KEY}`,
    },
    body: JSON.stringify({
      model:      process.env.AI_MODEL,
      max_tokens: 4096,
      stream:     true,
      messages: [
        { role: 'system', content: buildSystemPrompt(username) },
        ...messages.slice(-20).map(m => ({ role: m.role, content: m.content })),
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || `AI API error ${response.status}`)
  }

  const reader  = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (raw === '[DONE]') {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
        continue
      }
      try {
        const event = JSON.parse(raw)
        const text  = event.choices?.[0]?.delta?.content
        if (text) res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`)
      } catch { }
    }
  }

  return 0
}

async function streamAI({ messages, res, username }) {
  const isAnthropic = (process.env.AI_BASE_URL || '').includes('anthropic')
  return isAnthropic
    ? streamAnthropic({ messages, res, username })
    : streamOpenAI({ messages, res, username })
}

module.exports = { streamAI, detectJailbreak }