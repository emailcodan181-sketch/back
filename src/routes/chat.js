const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const verifyJWT = require('../middleware/verifyJWT');
const { chatLimiter } = require('../middleware/rateLimiter');

router.post('/', verifyJWT, chatLimiter, chatController.sendMessage);
router.get('/conversations', verifyJWT, chatController.getConversations);

module.exports = router;