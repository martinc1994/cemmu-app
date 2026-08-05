const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

async function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Usuario y contraseña son requeridos.' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ ok: false, error: 'Credenciales incorrectas.' });
    }

    const user = result.rows[0];

    // Verificar si el usuario está activo
    if (user.is_active === false) {
      return res.status(403).json({ ok: false, error: 'Cuenta desactivada. Contacte al administrador.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ ok: false, error: 'Credenciales incorrectas.' });
    }

    // Actualizar last_login
    await pool.query('UPDATE usuarios SET last_login = NOW() WHERE id = $1', [user.id]);

    // Generar JWT firmado con datos extendidos
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        must_change_password: user.must_change_password || false,
        organization: user.organization || null
      },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    // Registrar en audit_log
    await pool.query(
      `INSERT INTO audit_log (user_id, username, action, resource_type, ip_address)
       VALUES ($1, $2, 'login', 'auth', $3)`,
      [user.id, user.username, req.ip]
    );

    res.json({
      ok: true,
      token,
      user: {
        username: user.username,
        role: user.role,
        full_name: user.full_name || user.username,
        must_change_password: user.must_change_password || false,
        organization: user.organization || null
      }
    });

  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor.' });
  }
}

async function changePassword(req, res) {
  const { current_password, new_password } = req.body;
  const userId = req.user.id;

  if (!current_password || !new_password) {
    return res.status(400).json({ ok: false, error: 'Contraseña actual y nueva son requeridas.' });
  }

  // Validar requisitos de la nueva contraseña
  if (new_password.length < 8) {
    return res.status(400).json({ ok: false, error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
  }
  if (!/[A-Z]/.test(new_password)) {
    return res.status(400).json({ ok: false, error: 'La nueva contraseña debe contener al menos una mayúscula.' });
  }
  if (!/[0-9]/.test(new_password)) {
    return res.status(400).json({ ok: false, error: 'La nueva contraseña debe contener al menos un número.' });
  }

  try {
    // Obtener usuario actual
    const result = await pool.query('SELECT * FROM usuarios WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });
    }

    const user = result.rows[0];

    // Verificar contraseña actual
    const passwordMatch = await bcrypt.compare(current_password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ ok: false, error: 'Contraseña actual incorrecta.' });
    }

    // Hashear nueva contraseña
    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(new_password, salt);

    // Actualizar en DB
    await pool.query(
      'UPDATE usuarios SET password_hash = $1, must_change_password = false, updated_at = NOW() WHERE id = $2',
      [newHash, userId]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_log (user_id, username, action, resource_type, ip_address)
       VALUES ($1, $2, 'password_change', 'auth', $3)`,
      [userId, user.username, req.ip]
    );

    // Generar nuevo token sin must_change_password
    const newToken = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        must_change_password: false,
        organization: user.organization || null
      },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      ok: true,
      message: 'Contraseña actualizada correctamente.',
      token: newToken,
      user: {
        username: user.username,
        role: user.role,
        full_name: user.full_name || user.username,
        must_change_password: false,
        organization: user.organization || null
      }
    });

  } catch (err) {
    console.error('Error al cambiar contraseña:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor.' });
  }
}

module.exports = { login, changePassword };
