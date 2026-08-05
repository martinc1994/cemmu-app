const express = require('express');
const router = express.Router();
const {
  getUsuarios,
  createUsuario,
  updateUsuario,
  deleteUsuario,
  getOrganizaciones,
  createOrganizacion,
  deleteOrganizacion
} = require('../controllers/usuarios.controller');
const { authenticateToken, requireAdmin } = require('../middleware/auth.middleware');

// Organizaciones (DEBEN IR ANTES de /:id para evitar colisiones de rutas)
router.get('/organizaciones', authenticateToken, requireAdmin, getOrganizaciones);
router.post('/organizaciones', authenticateToken, requireAdmin, createOrganizacion);
router.delete('/organizaciones/:id', authenticateToken, requireAdmin, deleteOrganizacion);

// Usuarios
router.get('/', authenticateToken, requireAdmin, getUsuarios);
router.post('/', authenticateToken, requireAdmin, createUsuario);
router.put('/:id', authenticateToken, requireAdmin, updateUsuario);
router.delete('/:id', authenticateToken, requireAdmin, deleteUsuario);

module.exports = router;
