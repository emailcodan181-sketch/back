/**
 * VALVET — Middleware: Verificação de Admin
 * Deve ser usado APÓS verifyJWT.
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

module.exports = async function verifyAdmin(req, res, next) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })

    if (!user || !user.isAdmin) {
      // Gravar tentativa de acesso não autorizado
      await prisma.loginLog.create({
        data: {
          userId:    req.user.userId,
          username:  req.user.username || 'unknown',
          ip:        req.ip || 'unknown',
          userAgent: req.headers['user-agent'] || 'unknown',
          status:    'FAILURE',
          reason:    'UNAUTHORIZED_ADMIN_ACCESS',
        },
      }).catch(() => {})

      return res.status(403).json({ error: 'Acesso negado' })
    }

    req.adminUser = user
    next()
  } catch {
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
}
