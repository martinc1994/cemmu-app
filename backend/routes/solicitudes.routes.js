const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();

const {
  createSolicitud,
  getSolicitudes,
  getSolicitudById,
  responderSolicitud,
  descargarInstrumento
} = require('../controllers/solicitudes.controller');

const {
  authenticateToken,
  requireOperatorOrAdmin,
  requireAnyAuthenticated
} = require('../middleware/auth.middleware');

// Configuración de Multer para instrumento legal (máx 3MB, PDF/JPG/PNG)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tmpDir = path.join(__dirname, '..', '..', 'data', 'tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    cb(null, tmpDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = 'inst-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'application/pdf'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de archivo no permitido para instrumento legal. Formatos aceptados: JPG, PNG, PDF'), false);
  }
};

const uploadLegal = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // Max 3MB
  fileFilter
});

function handleMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ ok: false, error: 'El instrumento legal excede el tamaño máximo permitido (3 MB).' });
    }
    return res.status(400).json({ ok: false, error: err.message });
  }
  if (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
  next();
}

// Crear solicitud con instrumento legal obligatorio (Cualquier usuario autenticado)
router.post('/',
  authenticateToken,
  requireAnyAuthenticated,
  uploadLegal.single('instrumento_legal'),
  handleMulterError,
  createSolicitud
);

// Descargar instrumento legal de una solicitud
router.get('/:id/instrumento', authenticateToken, requireAnyAuthenticated, descargarInstrumento);

// Listar solicitudes
router.get('/', authenticateToken, requireAnyAuthenticated, getSolicitudes);

// Detalle de solicitud
router.get('/:id', authenticateToken, requireAnyAuthenticated, getSolicitudById);

// Responder/Completar solicitud (Solo operadores y admin)
router.put('/:id/responder', authenticateToken, requireOperatorOrAdmin, responderSolicitud);

module.exports = router;
