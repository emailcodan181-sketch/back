const jwt = require('jsonwebtoken')

module.exports = function verifyJWT(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null

  if (!token) return res.status(401).json({ error: 'Token de acesso ausente' })

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)

    // Verificar se usuário foi kickado
    try {
      const { kickedUsers } = require('../controllers/adminController')
      if (kickedUsers.has(payload.userId)) {
        return res.status(401).json({ error: 'Sessão encerrada pelo administrador' })
      }
    } catch { }

    req.user = payload
    next()
  } catch (err) {
    const reason = err.name === 'TokenExpiredError' ? 'EXPIRED_TOKEN' : 'INVALID_TOKEN'
    return res.status(401).json({ error: 'Token inválido ou expirado', reason })
  }
}