const express = require('express');
const router = express.Router();
const { login, changePassword } = require('../controllers/auth.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

router.post('/login', login);
router.post('/change-password', authenticateToken, changePassword);

module.exports = router;
