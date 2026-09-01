const express = require('express');
const router = express.Router();
const {
  getUnidadesRegistros,
  getUnidadesRegistroById,
  createUnidadesRegistro,
  updateUnidadesRegistro,
  deleteUnidadesRegistro
} = require('../controllers/unidades.controller');
const { authenticateToken, requireAdmin } = require('../middleware/auth.middleware');

// Todas las rutas requieren token y rol 'admin'
router.use(authenticateToken, requireAdmin);

router.get('/', getUnidadesRegistros);
router.get('/:id', getUnidadesRegistroById);
router.post('/', createUnidadesRegistro);
router.put('/:id', updateUnidadesRegistro);
router.delete('/:id', deleteUnidadesRegistro);

module.exports = router;
