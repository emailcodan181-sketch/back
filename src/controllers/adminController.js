const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const verifyJWT = require('../middleware/verifyJWT');
const verifyAdmin = require('../middleware/verifyAdmin');
const { adminLimiter } = require('../middleware/rateLimiter');

router.use(verifyJWT, verifyAdmin, adminLimiter);

router.get('/codes', adminController.getCodes);
router.post('/codes/generate', adminController.generateCode);
router.delete('/codes/:id', adminController.revokeCode);
router.get('/logs', adminController.getLogs);
router.get('/metrics', adminController.getMetrics);
router.get('/users', adminController.getUsers);
router.patch('/users/:id/promote', adminController.promoteUser);

module.exports = router;