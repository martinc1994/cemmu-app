const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token no proporcionado.' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ ok: false, error: 'Token inválido o expirado.' });
    }
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Acceso denegado: se requiere rol admin.' });
  }
  next();
}

/**
 * Requiere rol 'operador' o 'admin' (para uploads de evidencia)
 */
function requireOperatorOrAdmin(req, res, next) {
  const role = req.user?.role;
  if (role !== 'operador' && role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Acceso denegado: se requiere rol operador o admin.' });
  }
  next();
}

/**
 * Permite acceso a cualquier usuario autenticado (admin, operator, external)
 */
function requireAnyAuthenticated(req, res, next) {
  // Si llegó hasta aquí ya pasó authenticateToken, solo verificamos que exista user
  if (!req.user) {
    return res.status(401).json({ ok: false, error: 'Autenticación requerida.' });
  }
  next();
}

module.exports = { authenticateToken, requireAdmin, requireOperatorOrAdmin, requireAnyAuthenticated };
