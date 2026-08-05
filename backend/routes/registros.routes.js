const express = require('express');
const router = express.Router();
const { getRegistros, createRegistro, updateRegistro, deleteRegistro } = require('../controllers/registros.controller');
const { authenticateToken, requireAdmin } = require('../middleware/auth.middleware');

router.get('/', authenticateToken, getRegistros);

router.post('/', authenticateToken, createRegistro);

router.put('/:id', authenticateToken, requireAdmin, updateRegistro);
router.delete('/:id', authenticateToken, requireAdmin, deleteRegistro);

module.exports = router;
