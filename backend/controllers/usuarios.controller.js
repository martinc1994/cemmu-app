const bcrypt = require('bcrypt');
const pool = require('../config/db');

/**
 * GET /api/usuarios — Lista todos los usuarios
 */
async function getUsuarios(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, username, full_name, email, role, organization, 
              is_active, must_change_password, last_login, created_at
       FROM usuarios 
       ORDER BY created_at DESC`
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error('Error al obtener usuarios:', err);
    res.status(500).json({ ok: false, error: 'Error al obtener usuarios.' });
  }
}

/**
 * POST /api/usuarios — Crear nuevo usuario
 */
async function createUsuario(req, res) {
  const { username, password, full_name, email, role, organization } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ ok: false, error: 'Username, password y rol son requeridos.' });
  }

  // Validar rol
  const validRoles = ['admin', 'operador', 'externo'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ ok: false, error: 'Rol inválido. Debe ser: admin, operador o externo.' });
  }

  // Organización por defecto "CeMMU" si viene vacía
  const userOrg = (organization && organization.trim() !== '') ? organization.trim() : 'CeMMU';

  try {
    // Verificar si el username ya existe
    const existing = await pool.query('SELECT id FROM usuarios WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ ok: false, error: 'El nombre de usuario ya existe.' });
    }

    // Hash de la contraseña
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const result = await pool.query(
      `INSERT INTO usuarios (username, password_hash, full_name, email, role, organization, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id, username, full_name, email, role, organization, is_active, must_change_password, created_at`,
      [username, hash, full_name || null, email || null, role, userOrg]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_log (user_id, username, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, 'create_user', 'usuario', $3, $4, $5)`,
      [req.user.id, req.user.username, result.rows[0].id, JSON.stringify({ created_username: username, role, organization: userOrg }), req.ip]
    );

    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error al crear usuario:', err);
    res.status(500).json({ ok: false, error: 'Error al crear usuario.' });
  }
}

/**
 * PUT /api/usuarios/:id — Actualizar usuario
 */
async function updateUsuario(req, res) {
  const { id } = req.params;
  const { full_name, email, role, organization, is_active, reset_password } = req.body;

  if (role) {
    const validRoles = ['admin', 'operador', 'externo'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ ok: false, error: 'Rol inválido. Debe ser: admin, operador o externo.' });
    }
  }

  try {
    // Verificar que el usuario existe
    const existing = await pool.query('SELECT * FROM usuarios WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });
    }

    const userOrg = (organization !== undefined && organization !== null && organization.trim() !== '')
      ? organization.trim()
      : (existing.rows[0].organization || 'CeMMU');

    let query = `UPDATE usuarios SET full_name = $1, email = $2, role = $3, organization = $4, is_active = $5, updated_at = NOW()`;
    let params = [
      full_name || existing.rows[0].full_name,
      email !== undefined ? email : existing.rows[0].email,
      role || existing.rows[0].role,
      userOrg,
      is_active !== undefined ? is_active : existing.rows[0].is_active
    ];

    // Si se solicita resetear la contraseña
    if (reset_password) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(reset_password, salt);
      query += `, password_hash = $${params.length + 1}, must_change_password = true`;
      params.push(hash);
    }

    query += ` WHERE id = $${params.length + 1} RETURNING id, username, full_name, email, role, organization, is_active, must_change_password`;
    params.push(id);

    const result = await pool.query(query, params);

    // Audit log
    await pool.query(
      `INSERT INTO audit_log (user_id, username, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, 'update_user', 'usuario', $3, $4, $5)`,
      [req.user.id, req.user.username, id, JSON.stringify({ updated_fields: Object.keys(req.body) }), req.ip]
    );

    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error al actualizar usuario:', err);
    res.status(500).json({ ok: false, error: 'Error al actualizar usuario.' });
  }
}

/**
 * DELETE /api/usuarios/:id — Eliminar usuario definitivamente (HARD DELETE)
 */
async function deleteUsuario(req, res) {
  const { id } = req.params;

  try {
    // No permitir auto-eliminación
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ ok: false, error: 'No podés eliminar tu propia cuenta.' });
    }

    // Verificar que el usuario existe
    const existing = await pool.query('SELECT id, username FROM usuarios WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });
    }

    const usernameToDelete = existing.rows[0].username;

    // Desvincular referencias en tablas dependientes antes del hard delete
    await pool.query('UPDATE audit_log SET user_id = NULL WHERE user_id = $1', [id]);
    await pool.query('UPDATE evidencia SET uploaded_by = NULL WHERE uploaded_by = $1', [id]);
    await pool.query('UPDATE download_tokens SET generated_by = NULL WHERE generated_by = $1', [id]);

    // HARD DELETE de la base de datos
    await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);

    // Audit log
    await pool.query(
      `INSERT INTO audit_log (user_id, username, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, 'delete_user', 'usuario', $3, $4, $5)`,
      [req.user.id, req.user.username, id, JSON.stringify({ deleted_username: usernameToDelete }), req.ip]
    );

    res.json({ ok: true, message: `Usuario "${usernameToDelete}" eliminado definitivamente de la base de datos.` });
  } catch (err) {
    console.error('Error al eliminar usuario:', err);
    res.status(500).json({ ok: false, error: 'Error al eliminar usuario de la base de datos.' });
  }
}

/**
 * GET /api/usuarios/organizaciones — Lista organizaciones con conteo de usuarios
 */
async function getOrganizaciones(req, res) {
  try {
    const result = await pool.query(
      `SELECT o.*, COUNT(u.id)::int as user_count
       FROM organizaciones o
       LEFT JOIN usuarios u ON u.organization = o.nombre
       GROUP BY o.id
       ORDER BY o.nombre ASC`
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error('Error al obtener organizaciones:', err);
    res.status(500).json({ ok: false, error: 'Error al obtener organizaciones.' });
  }
}

/**
 * POST /api/usuarios/organizaciones — Crear organización
 */
async function createOrganizacion(req, res) {
  const { nombre, tipo, contacto, notas } = req.body;

  if (!nombre || !tipo) {
    return res.status(400).json({ ok: false, error: 'Nombre y tipo son requeridos.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO organizaciones (nombre, tipo, contacto, notas)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [nombre.trim(), tipo, contacto || null, notas || null]
    );

    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') { // unique violation
      return res.status(409).json({ ok: false, error: 'Ya existe una organización con ese nombre.' });
    }
    console.error('Error al crear organización:', err);
    res.status(500).json({ ok: false, error: 'Error al crear organización.' });
  }
}

/**
 * DELETE /api/usuarios/organizaciones/:id — Eliminar organización definitivamente (HARD DELETE)
 */
async function deleteOrganizacion(req, res) {
  const { id } = req.params;

  try {
    const existing = await pool.query('SELECT id, nombre FROM organizaciones WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Organización no encontrada.' });
    }

    const orgName = existing.rows[0].nombre;

    if (orgName === 'CeMMU') {
      return res.status(400).json({ ok: false, error: 'No se puede eliminar la organización del sistema (CeMMU).' });
    }

    // Reasignar usuarios pertenecientes a esta organización a 'CeMMU'
    await pool.query("UPDATE usuarios SET organization = 'CeMMU' WHERE organization = $1", [orgName]);

    // HARD DELETE de la base de datos
    await pool.query('DELETE FROM organizaciones WHERE id = $1', [id]);

    res.json({ ok: true, message: `Organización "${orgName}" eliminada definitivamente de la base de datos.` });
  } catch (err) {
    console.error('Error al eliminar organización:', err);
    res.status(500).json({ ok: false, error: 'Error al eliminar la organización de la base de datos.' });
  }
}

module.exports = {
  getUsuarios,
  createUsuario,
  updateUsuario,
  deleteUsuario,
  getOrganizaciones,
  createOrganizacion,
  deleteOrganizacion
};
