/**
 * VALVET — Middleware: Verificação de JWT
 */

const jwt = require('jsonwebtoken')

module.exports = function verifyJWT(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso ausente' })
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.user = payload
    next()
  } catch (err) {
    const reason = err.name === 'TokenExpiredError' ? 'EXPIRED_TOKEN' : 'INVALID_TOKEN'
    return res.status(401).json({ error: 'Token inválido ou expirado', reason })
  }
}
