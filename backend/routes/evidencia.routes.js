const express = require('express');
const path = require('path');
const multer = require('multer');
const router = express.Router();

const {
  uploadEvidencia,
  getEvidencias,
  getEvidenciaById,
  generateDownloadToken,
  downloadByToken,
  deleteEvidencia,
  getAuditLog
} = require('../controllers/evidencia.controller');

const {
  authenticateToken,
  requireAdmin,
  requireOperatorOrAdmin,
  requireAnyAuthenticated
} = require('../middleware/auth.middleware');

// Configuración de Multer para archivos temporales
const maxFileSize = parseInt(process.env.EVIDENCE_MAX_FILE_SIZE_MB || '50') * 1024 * 1024;

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tmpDir = path.join(__dirname, '..', '..', 'data', 'tmp');
    const fs = require('fs');
    fs.mkdirSync(tmpDir, { recursive: true });
    cb(null, tmpDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'video/mp4', 'video/avi', 'video/x-msvideo', 'video/quicktime', 'video/x-matroska',
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf'
  ];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}. Formatos aceptados: MP4, AVI, MOV, MKV, JPG, PNG, WebP, PDF`), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: maxFileSize },
  fileFilter
});

// Middleware para manejar errores de multer
function handleMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ ok: false, error: `El archivo excede el tamaño máximo permitido (${process.env.EVIDENCE_MAX_FILE_SIZE_MB || 50}MB).` });
    }
    return res.status(400).json({ ok: false, error: err.message });
  }
  if (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
  next();
}

// ═══════════════════════════════════════════════════════════
// RUTAS
// ═══════════════════════════════════════════════════════════

// Upload — solo operadores y admin
router.post('/upload',
  authenticateToken,
  requireOperatorOrAdmin,
  upload.single('archivo'),
  handleMulterError,
  uploadEvidencia
);

// Audit log — solo admin (DEBE ir antes de /:id para no colisionar)
router.get('/audit', authenticateToken, requireAdmin, getAuditLog);

// Descargar por token — requiere JWT (doble verificación: login + token)
router.get('/download/:token', authenticateToken, requireAnyAuthenticated, downloadByToken);

// Listar evidencias — cualquier usuario autenticado
router.get('/', authenticateToken, requireAnyAuthenticated, getEvidencias);

// Detalle de evidencia — cualquier usuario autenticado
router.get('/:id', authenticateToken, requireAnyAuthenticated, getEvidenciaById);

// Generar token de descarga — solo operadores y admin
router.post('/:id/share', authenticateToken, requireOperatorOrAdmin, generateDownloadToken);

// Eliminar evidencia — solo admin
router.delete('/:id', authenticateToken, requireAdmin, deleteEvidencia);

module.exports = router;
