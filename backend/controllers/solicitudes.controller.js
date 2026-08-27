const path = require('path');
const fs = require('fs');
const pool = require('../config/db');

function getSolicitudesStoragePath() {
  return process.env.SOLICITUDES_STORAGE_PATH || path.join(__dirname, '..', '..', 'data', 'solicitudes');
}

/**
 * POST /api/solicitudes — Crear solicitud de evidencia con instrumento legal obligatorio
 */
async function createSolicitud(req, res) {
  const { linea, interno, camara, fecha_evento, hora_aproximada, expediente, motivo, prioridad } = req.body;

  if (!req.file) {
    return res.status(400).json({
      ok: false,
      error: 'El instrumento legal (Oficio o Documento en formato PDF, JPG o PNG de hasta 3 MB) es obligatorio.'
    });
  }

  if (!linea || !interno || !fecha_evento || !expediente || !motivo) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(400).json({
      ok: false,
      error: 'Faltan campos obligatorios: línea, interno, fecha de evento, expediente y motivo de solicitud.'
    });
  }

  try {
    const organismo = req.user.organization || 'Externo';
    const tempPath = req.file.path;

    // Almacenar instrumento legal en data/solicitudes/YYYY/MM/
    const now = new Date();
    const yearMonth = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const storageDirPath = path.join(getSolicitudesStoragePath(), yearMonth);
    fs.mkdirSync(storageDirPath, { recursive: true });

    const storageFileName = `${Date.now()}-${req.file.filename}`;
    const finalStoragePath = path.join(storageDirPath, storageFileName);

    // Mover archivo
    fs.renameSync(tempPath, finalStoragePath);

    const storageRelativePath = path.join(yearMonth, storageFileName).replace(/\\/g, '/');

    const result = await pool.query(
      `INSERT INTO solicitudes_evidencia 
        (solicitante_id, solicitante_username, organismo, linea, interno, camara, fecha_evento, hora_aproximada, expediente, motivo, prioridad, estado,
         instrumento_archivo_original, instrumento_archivo_storage, instrumento_mime_type, instrumento_tamano_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PENDIENTE', $12, $13, $14, $15)
       RETURNING *`,
      [
        req.user.id,
        req.user.username,
        organismo,
        linea,
        parseInt(interno),
        camara || 'frontal',
        fecha_evento,
        hora_aproximada || null,
        expediente.trim(),
        motivo.trim(),
        prioridad || 'NORMAL',
        req.file.originalname,
        storageRelativePath,
        req.file.mimetype,
        req.file.size
      ]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_log (user_id, username, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, 'create_solicitud', 'solicitud', $3, $4, $5)`,
      [
        req.user.id, req.user.username, result.rows[0].id,
        JSON.stringify({ expediente, linea, interno, fecha_evento, instrumento: req.file.originalname }),
        req.ip
      ]
    );

    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Error al crear solicitud:', err);
    res.status(500).json({ ok: false, error: 'Error al procesar la solicitud de evidencia.' });
  }
}

/**
 * GET /api/solicitudes — Listar solicitudes de evidencia
 * Externos ven sólo sus solicitudes o de su organismo. Operadores/Admins ven todas.
 */
async function getSolicitudes(req, res) {
  try {
    const { estado, expediente, linea } = req.query;

    let query = `SELECT s.*, u.full_name as solicitante_fullname,
                        e.nombre_archivo_original, e.tamano_bytes, e.checksum_sha256
                 FROM solicitudes_evidencia s
                 LEFT JOIN usuarios u ON s.solicitante_id = u.id
                 LEFT JOIN evidencia e ON s.evidencia_id = e.id
                 WHERE 1=1`;
    let params = [];
    let paramCount = 0;

    // Si es usuario externo, filtrar por sus solicitudes u organismo
    if (req.user.role === 'externo') {
      paramCount++;
      params.push(req.user.id);
      paramCount++;
      params.push(req.user.organization || '');
      query += ` AND (s.solicitante_id = $${paramCount - 1} OR s.organismo = $${paramCount})`;
    }

    if (estado) {
      paramCount++;
      params.push(estado);
      query += ` AND s.estado = $${paramCount}`;
    }

    if (expediente) {
      paramCount++;
      params.push(`%${expediente}%`);
      query += ` AND s.expediente ILIKE $${paramCount}`;
    }

    if (linea) {
      paramCount++;
      params.push(linea);
      query += ` AND s.linea = $${paramCount}`;
    }

    query += ` ORDER BY s.created_at DESC`;

    const result = await pool.query(query, params);
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error('Error al obtener solicitudes:', err);
    res.status(500).json({ ok: false, error: 'Error al obtener solicitudes.' });
  }
}

/**
 * GET /api/solicitudes/:id — Detalle de solicitud
 */
async function getSolicitudById(req, res) {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT s.*, u.full_name as solicitante_fullname, u.email as solicitante_email,
              e.nombre_archivo_original, e.tamano_bytes, e.checksum_sha256, e.created_at as evidencia_created_at
       FROM solicitudes_evidencia s
       LEFT JOIN usuarios u ON s.solicitante_id = u.id
       LEFT JOIN evidencia e ON s.evidencia_id = e.id
       WHERE s.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Solicitud no encontrada.' });
    }

    const sol = result.rows[0];

    // Verificar permisos si es externo
    if (req.user.role === 'externo' && sol.solicitante_id !== req.user.id && sol.organismo !== req.user.organization) {
      return res.status(403).json({ ok: false, error: 'No tenés permiso para ver esta solicitud.' });
    }

    res.json({ ok: true, data: sol });
  } catch (err) {
    console.error('Error al obtener detalle de solicitud:', err);
    res.status(500).json({ ok: false, error: 'Error al obtener la solicitud.' });
  }
}

/**
 * GET /api/solicitudes/:id/instrumento — Descargar o ver instrumento legal adjunto
 */
async function descargarInstrumento(req, res) {
  try {
    const { id } = req.params;

    const result = await pool.query('SELECT * FROM solicitudes_evidencia WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Solicitud no encontrada.' });
    }

    const sol = result.rows[0];

    if (req.user.role === 'externo' && sol.solicitante_id !== req.user.id && sol.organismo !== req.user.organization) {
      return res.status(403).json({ ok: false, error: 'No tenés permiso para ver este instrumento legal.' });
    }

    if (!sol.instrumento_archivo_storage) {
      return res.status(404).json({ ok: false, error: 'La solicitud no cuenta con instrumento legal adjunto.' });
    }

    const filePath = path.join(getSolicitudesStoragePath(), sol.instrumento_archivo_storage);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: 'El archivo físico del instrumento legal no fue encontrado.' });
    }

    res.setHeader('Content-Type', sol.instrumento_mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(sol.instrumento_archivo_original)}"`);

    fs.createReadStream(filePath).pipe(res);

  } catch (err) {
    console.error('Error al descargar instrumento legal:', err);
    res.status(500).json({ ok: false, error: 'Error al descargar instrumento legal.' });
  }
}

/**
 * PUT /api/solicitudes/:id/responder — Responder/Completar solicitud (Operador / Admin)
 */
async function responderSolicitud(req, res) {
  const { id } = req.params;
  const { estado, evidencia_id, respuesta_notas } = req.body;

  if (!estado || !['COMPLETADA', 'RECHAZADA', 'EN_PROCESO'].includes(estado)) {
    return res.status(400).json({ ok: false, error: 'Estado inválido. Debe ser: COMPLETADA, RECHAZADA o EN_PROCESO.' });
  }

  try {
    const solRes = await pool.query('SELECT * FROM solicitudes_evidencia WHERE id = $1', [id]);
    if (solRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Solicitud no encontrada.' });
    }
    const sol = solRes.rows[0];

    let parsedEvidenciaId = null;
    if (evidencia_id !== undefined && evidencia_id !== null && String(evidencia_id).trim() !== '') {
      parsedEvidenciaId = parseInt(evidencia_id);
      const evCheck = await pool.query('SELECT id FROM evidencia WHERE id = $1 AND status = \'active\'', [parsedEvidenciaId]);
      if (evCheck.rows.length === 0) {
        return res.status(400).json({ ok: false, error: `La evidencia con ID #${parsedEvidenciaId} no existe en el repositorio.` });
      }
    } else {
      parsedEvidenciaId = sol.evidencia_id;
    }

    // Calcular expiración a 30 días si la solicitud pasa a COMPLETADA
    const expiresAt = (estado === 'COMPLETADA') ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : sol.expires_at;

    const updated = await pool.query(
      `UPDATE solicitudes_evidencia
       SET estado = $1, evidencia_id = $2, respuesta_notas = $3, atendido_por = $4, expires_at = $5, max_downloads = 4, updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [
        estado,
        parsedEvidenciaId,
        respuesta_notas || null,
        req.user.id,
        expiresAt ? expiresAt.toISOString() : null,
        id
      ]
    );

    if (estado === 'COMPLETADA' && parsedEvidenciaId) {
      const existsCheck = await pool.query(
        `SELECT id FROM evidencia_compartida 
         WHERE evidencia_id = $1 AND (target_user_id = $2 OR target_org = $3)`,
        [parsedEvidenciaId, sol.solicitante_id, sol.organismo]
      );
      if (existsCheck.rows.length === 0) {
        await pool.query(
          `INSERT INTO evidencia_compartida (evidencia_id, target_org, target_user_id, shared_by, notes, expires_at, max_downloads, downloads_count)
           VALUES ($1, $2, $3, $4, $5, $6, 4, 0)`,
          [
            parsedEvidenciaId,
            sol.organismo,
            sol.solicitante_id,
            req.user.id,
            `En respuesta a Solicitud #${id} (Expediente: ${sol.expediente})`,
            expiresAt ? expiresAt.toISOString() : null
          ]
        );
      }
    }

    await pool.query(
      `INSERT INTO audit_log (user_id, username, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, 'responder_solicitud', 'solicitud', $3, $4, $5)`,
      [
        req.user.id, req.user.username, id,
        JSON.stringify({ estado, evidencia_id: parsedEvidenciaId, respuesta_notas }),
        req.ip
      ]
    );

    res.json({ ok: true, data: updated.rows[0] });

  } catch (err) {
    console.error('Error al responder solicitud:', err);
    res.status(500).json({ ok: false, error: 'Error al responder la solicitud.' });
  }
}

module.exports = {
  createSolicitud,
  getSolicitudes,
  getSolicitudById,
  descargarInstrumento,
  responderSolicitud
};
