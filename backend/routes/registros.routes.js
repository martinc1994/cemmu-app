const express = require('express');
const router = express.Router();
const { getRegistros, createRegistro, updateRegistro, deleteRegistro, getRecorridos } = require('../controllers/registros.controller');
const { authenticateToken, requireAdmin } = require('../middleware/auth.middleware');

router.get('/recorridos', getRecorridos);
router.get('/', authenticateToken, getRegistros);

router.post('/', authenticateToken, createRegistro);

router.put('/:id', authenticateToken, requireAdmin, updateRegistro);
router.delete('/:id', authenticateToken, requireAdmin, deleteRegistro);

module.exports = router;
