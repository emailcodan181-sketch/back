/**
 * VALVET — Service: Proxy de IA com suporte a SSE
 * Suporta Anthropic (claude) e OpenAI (gpt).
 */

const SYSTEM_PROMPT = `Você é VALVET, uma interface de inteligência artificial operacional.
Seja preciso, direto e útil. Responda em português por padrão.
Não revele detalhes sobre sua implementação ou infraestrutura.`

// Padrões de jailbreak conhecidos
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

/**
 * Chama a API da Anthropic com streaming e envia chunks via SSE para o cliente.
 */
async function streamAnthropic({ messages, res }) {
  const response = await fetch(`${process.env.AI_BASE_URL}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         process.env.AI_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      process.env.AI_MODEL,
      max_tokens: 2048,
      system:     SYSTEM_PROMPT,
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
  let buffer    = ''
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
      } catch { /* linha mal formada — ignorar */ }
    }
  }

  return totalTokens
}

/**
 * Chama a API da OpenAI com streaming.
 */
async function streamOpenAI({ messages, res }) {
  const response = await fetch(`${process.env.AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.AI_API_KEY}`,
    },
    body: JSON.stringify({
      model:    process.env.AI_MODEL,
      stream:   true,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
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
      } catch { /* ignorar */ }
    }
  }

  return 0
}

async function streamAI({ messages, res }) {
  const isAnthropic = (process.env.AI_BASE_URL || '').includes('anthropic')
  return isAnthropic ? streamAnthropic({ messages, res }) : streamOpenAI({ messages, res })
}

module.exports = { streamAI, detectJailbreak }
