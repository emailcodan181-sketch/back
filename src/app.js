/**
 * VALVET — Backend Entry Point
 */

require('dotenv').config()
const express    = require('express')
const helmet     = require('helmet')
const cors       = require('cors')
const cookieParser = require('cookie-parser')
const { globalLimiter } = require('./middleware/rateLimiter')

const authRoutes  = require('./routes/auth')
const chatRoutes  = require('./routes/chat')
const adminRoutes = require('./routes/admin')

const app  = express()
const PORT = process.env.PORT || 4000

// ── Trust proxy (Railway, Render, Vercel) ─────────────────────────
app.set('trust proxy', 1)

// ── Segurança: Helmet ─────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", 'https://fonts.googleapis.com'],
      fontSrc:    ["'self'", 'https://fonts.gstatic.com'],
      connectSrc: ["'self'"],
      imgSrc:     ["'self'", 'data:'],
      frameSrc:   ["'none'"],
    },
  },
}))

// ── CORS dinâmico via whitelist ───────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())

app.use(cors({
  origin: (origin, callback) => {
    // Permitir ferramentas como Postman em dev (sem origin)
    if (!origin && process.env.NODE_ENV !== 'production') return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    callback(new Error(`CORS: origem não permitida — ${origin}`))
  },
  credentials: true,
}))

// ── Parsers ───────────────────────────────────────────────────────
app.use(express.json({ limit: '50kb' }))
app.use(cookieParser())

// ── Rate limit global ─────────────────────────────────────────────
app.use(globalLimiter)

// ── Rotas ─────────────────────────────────────────────────────────
app.use('/api/v1/auth',  authRoutes)
app.use('/api/v1/chat',  chatRoutes)
app.use('/api/v1/admin', adminRoutes)

// ── Health check ──────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

// ── 404 ───────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada' }))

// ── Error handler ─────────────────────────────────────────────────
app.use((err, req, res, next) => {
  const isProd = process.env.NODE_ENV === 'production'
  if (!isProd) console.error(err)
  res.status(err.status || 500).json({
    error: isProd ? 'Erro interno do servidor' : err.message,
  })
})

app.listen(PORT, () => {
  console.log(`VALVET backend rodando na porta ${PORT} [${process.env.NODE_ENV}]`)
})
