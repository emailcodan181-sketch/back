/**
 * VALVET — Rate Limiters
 */

const rateLimit = require('express-rate-limit')

const createLimiter = (max, windowMinutes, message) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
  })

const globalLimiter = createLimiter(200, 1, 'Muitas requisições. Tente novamente em breve.')
const loginLimiter  = createLimiter(5,  15, 'Muitas tentativas de login. Aguarde 15 minutos.')
const registerLimiter = createLimiter(3, 60, 'Limite de registros atingido. Aguarde 1 hora.')
const chatLimiter   = createLimiter(30, 1, 'Limite de mensagens atingido. Aguarde 1 minuto.')
const adminLimiter  = createLimiter(20, 1, 'Limite de requisições admin atingido.')

module.exports = { globalLimiter, loginLimiter, registerLimiter, chatLimiter, adminLimiter }
