const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pool = require('../config/db');
const { encryptFile, decryptFileStream, calculateSHA256 } = require('../utils/crypto');

// Directorio de almacenamiento (configurable via .env)
function getStoragePath() {
  return process.env.EVIDENCE_STORAGE_PATH || path.join(__dirname, '..', '..', 'data', 'evidencia');
}

/**
 * POST /api/evidencia/upload — Subir archivo de evidencia
 * Requiere: multer middleware aplicado en la ruta
 */
async function uploadEvidencia(req, res) {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: 'No se recibió ningún archivo.' });
  }

  const { linea, interno, camara, fecha_evento, hora_evento, descripcion, expediente, organismo_solicitante } = req.body;

  // Validaciones
  if (!linea || !interno || !camara || !fecha_evento || !descripcion) {
    // Eliminar archivo temporal si falla validación
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ ok: false, error: 'Faltan campos obligatorios: linea, interno, camara, fecha_evento, descripcion.' });
  }

  const validCamaras = ['frontal', 'escalera', 'chofer', 'interior'];
  if (!validCamaras.includes(camara)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ ok: false, error: 'Cámara inválida. Debe ser: frontal, escalera, chofer o interior.' });
  }

  // Validar límite de archivos por expediente (máx 4)
  if (expediente) {
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM evidencia WHERE expediente = $1 AND status = 'active'`,
      [expediente]
    );
    if (parseInt(countResult.rows[0].total) >= 4) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ ok: false, error: 'El expediente ya tiene 4 archivos asociados (máximo permitido).' });
    }
  }

  try {
    const tempFilePath = req.file.path;

    // 1. Calcular SHA-256 del archivo original
    const checksum = await calculateSHA256(tempFilePath);

    // 2. Generar nombre de almacenamiento
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    const storageFileName = `${crypto.randomUUID()}${fileExt}.enc`;

    // 3. Crear directorio de almacenamiento por año/mes
    const now = new Date();
    const yearMonth = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const storageDirPath = path.join(getStoragePath(), yearMonth);
    fs.mkdirSync(storageDirPath, { recursive: true });

    const encryptedFilePath = path.join(storageDirPath, storageFileName);

    // 4. Encriptar y almacenar
    await encryptFile(tempFilePath, encryptedFilePath);

    // 5. Eliminar archivo temporal
    fs.unlinkSync(tempFilePath);

    // 6. Insertar registro en BD
    const storageRelativePath = path.join(yearMonth, storageFileName).replace(/\\/g, '/');

    const result = await pool.query(
      `INSERT INTO evidencia 
        (linea, interno, camara, fecha_evento, hora_evento, descripcion, expediente, organismo_solicitante,
         nombre_archivo_original, nombre_archivo_storage, mime_type, tamano_bytes, checksum_sha256, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        linea, parseInt(interno), camara, fecha_evento, hora_evento || null,
        descripcion, expediente || null, organismo_solicitante || null,
        req.file.originalname, storageRelativePath,
        req.file.mimetype, req.file.size, checksum, req.user.id
      ]
    );

    // 7. Si se especificó organización u usuario destino, crear registro de compartición directa
    const insertedEvId = result.rows[0].id;
    const { target_user_id } = req.body;

    if (organismo_solicitante || target_user_id) {
      await pool.query(
        `INSERT INTO evidencia_compartida (evidencia_id, target_org, target_user_id, shared_by, notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          insertedEvId,
          organismo_solicitante || null,
          (target_user_id && target_user_id !== '') ? parseInt(target_user_id) : null,
          req.user.id,
          'Asignación directa realizada durante la carga por el operador'
        ]
      );
    }

    // 8. Audit log
    await pool.query(
      `INSERT INTO audit_log (user_id, username, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, 'upload', 'evidencia', $3, $4, $5)`,
      [
        req.user.id, req.user.username, insertedEvId,
        JSON.stringify({
          filename: req.file.originalname,
          size_bytes: req.file.size,
          checksum,
          linea, interno, camara, expediente, organismo_solicitante, target_user_id
        }),
        req.ip
      ]
    );

    res.status(201).json({
      ok: true,
      data: {
        id: result.rows[0].id,
        nombre_archivo_original: result.rows[0].nombre_archivo_original,
        tamano_bytes: result.rows[0].tamano_bytes,
        checksum_sha256: result.rows[0].checksum_sha256,
        created_at: result.rows[0].created_at
      }
    });

  } catch (err) {
    // Limpiar archivo temporal si existe
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Error al subir evidencia:', err);
    res.status(500).json({ ok: false, error: 'Error al procesar el archivo.' });
  }
}

/**
 * GET /api/evidencia — Listar evidencias con filtros
 */
async function getEvidencias(req, res) {
  try {
    const { linea, interno, camara, fecha_desde, fecha_hasta, expediente, page = 1, limit = 20 } = req.query;

    let query = `SELECT e.*, u.username as uploaded_by_username
                 FROM evidencia e 
                 LEFT JOIN usuarios u ON e.uploaded_by = u.id
                 WHERE e.status = 'active'`;
    let params = [];
    let paramCount = 0;

    // Si es usuario externo, filtrar sólo las evidencias a las que tiene acceso legítimo
    if (req.user.role === 'externo') {
      paramCount++;
      params.push(req.user.id);
      paramCount++;
      params.push(req.user.organization || '');
      query += ` AND (
        e.uploaded_by = $${paramCount - 1} 
        OR e.id IN (SELECT evidencia_id FROM evidencia_compartida WHERE target_user_id = $${paramCount - 1} OR target_org = $${paramCount})
        OR e.id IN (SELECT evidencia_id FROM solicitudes_evidencia WHERE (solicitante_id = $${paramCount - 1} OR organismo = $${paramCount}) AND estado = 'COMPLETADA')
      )`;
    }

    if (linea) {
      paramCount++;
      params.push(linea);
      query += ` AND e.linea = $${paramCount}`;
    }
    if (interno) {
      paramCount++;
      params.push(parseInt(interno));
      query += ` AND e.interno = $${paramCount}`;
    }
    if (camara) {
      paramCount++;
      params.push(camara);
      query += ` AND e.camara = $${paramCount}`;
    }
    if (fecha_desde) {
      paramCount++;
      params.push(fecha_desde);
      query += ` AND e.fecha_evento >= $${paramCount}`;
    }
    if (fecha_hasta) {
      paramCount++;
      params.push(fecha_hasta);
      query += ` AND e.fecha_evento <= $${paramCount}`;
    }
    if (expediente) {
      paramCount++;
      params.push(`%${expediente}%`);
      query += ` AND e.expediente ILIKE $${paramCount}`;
    }

    // Paginación
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Count total
    const countQuery = query.replace(/SELECT e\.\*, u\.username as uploaded_by_username/, 'SELECT COUNT(*) as total');
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Agregar orden y paginación
    paramCount++;
    params.push(parseInt(limit));
    query += ` ORDER BY e.created_at DESC LIMIT $${paramCount}`;
    
    paramCount++;
    params.push(offset);
    query += ` OFFSET $${paramCount}`;

    const result = await pool.query(query, params);

    res.json({
      ok: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (err) {
    console.error('Error al obtener evidencias:', err);
    res.status(500).json({ ok: false, error: 'Error al obtener evidencias.' });
  }
}

/**
 * GET /api/evidencia/:id — Detalle de una evidencia
 */
async function getEvidenciaById(req, res) {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT e.*, u.username as uploaded_by_username
       FROM evidencia e
       LEFT JOIN usuarios u ON e.uploaded_by = u.id
       WHERE e.id = $1 AND e.status = 'active'`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Evidencia no encontrada.' });
    }

    // Obtener archivos del mismo expediente si existe
    let relatedFiles = [];
    const evidence = result.rows[0];
    if (evidence.expediente) {
      const related = await pool.query(
        `SELECT id, nombre_archivo_original, camara, tamano_bytes, created_at 
         FROM evidencia 
         WHERE expediente = $1 AND status = 'active' AND id != $2
         ORDER BY created_at ASC`,
        [evidence.expediente, id]
      );
      relatedFiles = related.rows;
    }

    // Audit log — view
    await pool.query(
      `INSERT INTO audit_log (user_id, username, action, resource_type, resource_id, ip_address)
       VALUES ($1, $2, 'view', 'evidencia', $3, $4)`,
      [req.user.id, req.user.username, id, req.ip]
    );

    res.json({ ok: true, data: evidence, relatedFiles });

  } catch (err) {
    console.error('Error al obtener evidencia:', err);
    res.status(500).json({ ok: false, error: 'Error al obtener evidencia.' });
  }
}

/**
 * POST /api/evidencia/:id/share — Generar token de descarga temporal
 * Requiere login + rol operator o admin
 */
async function generateDownloadToken(req, res) {
  try {
    const { id } = req.params;
    const { expires_hours = 48, max_downloads = 3 } = req.body;

    // Verificar que la evidencia existe
    const evidence = await pool.query(
      `SELECT id, nombre_archivo_original FROM evidencia WHERE id = $1 AND status = 'active'`,
      [id]
    );
    if (evidence.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Evidencia no encontrada.' });
    }

    // Generar token único
    const token = crypto.randomUUID() + '-' + crypto.randomBytes(16).toString('hex');

    // Calcular fecha de expiración
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + parseInt(expires_hours));

    const result = await pool.query(
      `INSERT INTO download_tokens (token, evidencia_id, generated_by, expires_at, max_downloads)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [token, id, req.user.id, expiresAt.toISOString(), parseInt(max_downloads)]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_log (user_id, username, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, 'share', 'evidencia', $3, $4, $5)`,
      [
        req.user.id, req.user.username, id,
        JSON.stringify({ token, expires_hours, max_downloads, filename: evidence.rows[0].nombre_archivo_original }),
        req.ip
      ]
    );

    res.json({
      ok: true,
      data: {
        token,
        download_url: `/api/evidencia/download/${token}`,
        expires_at: expiresAt.toISOString(),
        max_downloads: parseInt(max_downloads),
        filename: evidence.rows[0].nombre_archivo_original
      }
    });

  } catch (err) {
    console.error('Error al generar token de descarga:', err);
    res.status(500).json({ ok: false, error: 'Error al generar token de descarga.' });
  }
}

/**
 * GET /api/evidencia/download/:token — Descargar archivo con token temporal
 * Requiere: JWT (login previo) + token válido (doble verificación)
 */
async function downloadByToken(req, res) {
  try {
    const { token } = req.params;

    // 1. Verificar token
    const tokenResult = await pool.query(
      `SELECT dt.*, e.nombre_archivo_original, e.nombre_archivo_storage, e.mime_type, e.tamano_bytes
       FROM download_tokens dt
       JOIN evidencia e ON dt.evidencia_id = e.id
       WHERE dt.token = $1 AND dt.is_active = true`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Token de descarga inválido o expirado.' });
    }

    const tokenData = tokenResult.rows[0];

    // 2. Verificar expiración
    if (new Date() > new Date(tokenData.expires_at)) {
      await pool.query('UPDATE download_tokens SET is_active = false WHERE id = $1', [tokenData.id]);
      return res.status(410).json({ ok: false, error: 'El enlace de descarga ha expirado.' });
    }

    // 3. Verificar límite de descargas
    if (tokenData.current_downloads >= tokenData.max_downloads) {
      await pool.query('UPDATE download_tokens SET is_active = false WHERE id = $1', [tokenData.id]);
      return res.status(410).json({ ok: false, error: 'Se alcanzó el límite máximo de descargas para este enlace.' });
    }

    // 4. Buscar archivo encriptado
    const encryptedFilePath = path.join(getStoragePath(), tokenData.nombre_archivo_storage);
    if (!fs.existsSync(encryptedFilePath)) {
      return res.status(404).json({ ok: false, error: 'Archivo no encontrado en el almacenamiento.' });
    }

    // 5. Incrementar contador de descargas
    await pool.query(
      'UPDATE download_tokens SET current_downloads = current_downloads + 1 WHERE id = $1',
      [tokenData.id]
    );

    // 6. Audit log
    await pool.query(
      `INSERT INTO audit_log (user_id, username, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, 'download', 'evidencia', $3, $4, $5)`,
      [
        req.user.id, req.user.username, tokenData.evidencia_id,
        JSON.stringify({
          token,
          filename: tokenData.nombre_archivo_original,
          download_number: tokenData.current_downloads + 1
        }),
        req.ip
      ]
    );

    // 7. Desencriptar y streamear
    const { stream, cleanup } = await decryptFileStream(encryptedFilePath);

    // Obtener nombre original sin .enc
    const originalName = tokenData.nombre_archivo_original;

    res.setHeader('Content-Type', tokenData.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(originalName)}"`);

    stream.pipe(res);

    stream.on('end', () => {
      cleanup();
    });

    stream.on('error', (err) => {
      console.error('Error al desencriptar archivo:', err);
      cleanup();
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: 'Error al procesar el archivo.' });
      }
    });

  } catch (err) {
    console.error('Error en descarga:', err);
    res.status(500).json({ ok: false, error: 'Error al procesar la descarga.' });
  }
}

/**
 * DELETE /api/evidencia/:id — Soft-delete de evidencia (solo admin)
 */
async function deleteEvidencia(req, res) {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE evidencia SET status = 'deleted', updated_at = NOW() WHERE id = $1 AND status = 'active' 
       RETURNING id, nombre_archivo_original, nombre_archivo_storage`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Evidencia no encontrada.' });
    }

    // Eliminación física del archivo encriptado del disco rígido del servidor
    if (result.rows[0].nombre_archivo_storage) {
      const encryptedFilePath = path.join(getStoragePath(), result.rows[0].nombre_archivo_storage);
      if (fs.existsSync(encryptedFilePath)) {
        fs.unlinkSync(encryptedFilePath);
      }
    }

    // Desactivar tokens asociados
    await pool.query(
      'UPDATE download_tokens SET is_active = false WHERE evidencia_id = $1',
      [id]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_log (user_id, username, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, 'delete', 'evidencia', $3, $4, $5)`,
      [
        req.user.id, req.user.username, id,
        JSON.stringify({ filename: result.rows[0].nombre_archivo_original }),
        req.ip
      ]
    );

    res.json({ ok: true, message: `Archivo digital #${id} y recurso físico eliminados.` });

  } catch (err) {
    console.error('Error al eliminar evidencia:', err);
    res.status(500).json({ ok: false, error: 'Error al eliminar evidencia.' });
  }
}

/**
 * GET /api/evidencia/audit — Log de auditoría (solo admin)
 */
async function getAuditLog(req, res) {
  try {
    const { page = 1, limit = 50, action, user_id } = req.query;
    
    let query = 'SELECT * FROM audit_log WHERE 1=1';
    let params = [];
    let paramCount = 0;

    if (action) {
      paramCount++;
      params.push(action);
      query += ` AND action = $${paramCount}`;
    }
    if (user_id) {
      paramCount++;
      params.push(parseInt(user_id));
      query += ` AND user_id = $${paramCount}`;
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    paramCount++;
    params.push(parseInt(limit));
    query += ` ORDER BY created_at DESC LIMIT $${paramCount}`;
    paramCount++;
    params.push(offset);
    query += ` OFFSET $${paramCount}`;

    const result = await pool.query(query, params);

    res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error('Error al obtener audit log:', err);
    res.status(500).json({ ok: false, error: 'Error al obtener log de auditoría.' });
  }
}

/**
 * POST /api/evidencia/:id/compartir — Compartir evidencia con usuarios u organización específica
 */
async function compartirEvidencia(req, res) {
  try {
    const { id } = req.params;
    const { target_org, target_user_ids = [], notes } = req.body;

    const evidenceRes = await pool.query('SELECT id, nombre_archivo_original FROM evidencia WHERE id = $1 AND status = \'active\'', [id]);
    if (evidenceRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Evidencia no encontrada.' });
    }

    if ((!target_user_ids || target_user_ids.length === 0) && !target_org) {
      return res.status(400).json({ ok: false, error: 'Seleccioná una organización o al menos un usuario para compartir.' });
    }

    let createdRecords = [];

    // Si se especificaron usuarios puntuales
    if (Array.isArray(target_user_ids) && target_user_ids.length > 0) {
      for (const userId of target_user_ids) {
        const insertRes = await pool.query(
          `INSERT INTO evidencia_compartida (evidencia_id, target_org, target_user_id, shared_by, notes)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [id, target_org || null, parseInt(userId), req.user.id, notes || null]
        );
        createdRecords.push(insertRes.rows[0]);
      }
    } else if (target_org) {
      // Compartir a toda la organización
      const insertRes = await pool.query(
        `INSERT INTO evidencia_compartida (evidencia_id, target_org, target_user_id, shared_by, notes)
         VALUES ($1, $2, NULL, $3, $4) RETURNING *`,
        [id, target_org, req.user.id, notes || null]
      );
      createdRecords.push(insertRes.rows[0]);
    }

    // Audit log
    await pool.query(
      `INSERT INTO audit_log (user_id, username, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, 'compartir', 'evidencia', $3, $4, $5)`,
      [
        req.user.id, req.user.username, id,
        JSON.stringify({ target_org, target_user_ids, notes, filename: evidenceRes.rows[0].nombre_archivo_original }),
        req.ip
      ]
    );

    res.json({ ok: true, message: 'Evidencia compartida correctamente.', data: createdRecords });

  } catch (err) {
    console.error('Error al compartir evidencia:', err);
    res.status(500).json({ ok: false, error: 'Error al compartir evidencia.' });
  }
}

/**
 * GET /api/evidencia/:id/descargar — Descarga directa autorizada para cualquier usuario con permiso
 */
async function descargarEvidenciaDirecta(req, res) {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT * FROM evidencia WHERE id = $1 AND status = 'active'`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Evidencia no encontrada.' });
    }

    const evidence = result.rows[0];
    let hasAccess = false;

    if (req.user.role === 'admin' || req.user.role === 'operador') {
      hasAccess = true;
    } else if (evidence.uploaded_by === req.user.id) {
      hasAccess = true;
    } else {
      // Verificar si fue compartida con este usuario u organización
      const sharedCheck = await pool.query(
        `SELECT id FROM evidencia_compartida 
         WHERE evidencia_id = $1 AND (target_user_id = $2 OR target_org = $3)`,
        [id, req.user.id, req.user.organization || '']
      );

      if (sharedCheck.rows.length > 0) {
        hasAccess = true;
      } else {
        // Verificar si está vinculada a una solicitud completada de este usuario u organismo
        const solCheck = await pool.query(
          `SELECT id, expires_at, max_downloads, downloads_count FROM solicitudes_evidencia 
           WHERE evidencia_id = $1 AND (solicitante_id = $2 OR organismo = $3) AND estado = 'COMPLETADA'`,
          [id, req.user.id, req.user.organization || '']
        );
        if (solCheck.rows.length > 0) {
          const solRow = solCheck.rows[0];

          // 1. Verificar si pasaron los 30 días
          if (solRow.expires_at && new Date() > new Date(solRow.expires_at)) {
            return res.status(403).json({ ok: false, error: 'El plazo de disponibilidad de 30 días para este archivo digital ha expirado.' });
          }

          // 2. Verificar si superó las 4 descargas
          if (solRow.max_downloads && solRow.downloads_count >= solRow.max_downloads) {
            return res.status(403).json({ ok: false, error: `Ha alcanzado el límite máximo de ${solRow.max_downloads} descargas permitidas para este archivo digital.` });
          }

          // Incrementar contador de descargas
          await pool.query('UPDATE solicitudes_evidencia SET downloads_count = downloads_count + 1 WHERE id = $1', [solRow.id]);
          hasAccess = true;
        }
      }
    }

    if (!hasAccess) {
      return res.status(403).json({ ok: false, error: 'No tenés permiso para descargar este archivo digital.' });
    }

    // Buscar archivo físico encriptado
    const encryptedFilePath = path.join(getStoragePath(), evidence.nombre_archivo_storage);
    if (!fs.existsSync(encryptedFilePath)) {
      return res.status(404).json({ ok: false, error: 'El archivo no se encuentra en el almacenamiento.' });
    }

    // Audit log
    await pool.query(
      `INSERT INTO audit_log (user_id, username, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, 'download_direct', 'evidencia', $3, $4, $5)`,
      [
        req.user.id, req.user.username, id,
        JSON.stringify({ filename: evidence.nombre_archivo_original, size_bytes: evidence.tamano_bytes }),
        req.ip
      ]
    );

    // Desencriptar y enviar en stream
    const { stream, cleanup } = await decryptFileStream(encryptedFilePath);

    res.setHeader('Content-Type', evidence.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(evidence.nombre_archivo_original)}"`);

    stream.pipe(res);
    stream.on('end', () => cleanup());
    stream.on('error', (err) => {
      console.error('Error al desencriptar archivo:', err);
      cleanup();
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: 'Error al procesar el archivo.' });
      }
    });

  } catch (err) {
    console.error('Error al descargar evidencia directa:', err);
    res.status(500).json({ ok: false, error: 'Error al procesar la descarga.' });
  }
}

/**
 * GET /api/evidencia/historial — Registro completo de todas las cargas (solo Operadores / Admin)
 */
async function getCargasHistorial(req, res) {
  try {
    const result = await pool.query(
      `SELECT e.id, e.linea, e.interno, e.camara, e.fecha_evento, e.hora_evento, e.descripcion,
              e.expediente, e.organismo_solicitante, e.nombre_archivo_original, e.tamano_bytes,
              e.checksum_sha256, e.status, e.created_at, u.username as uploader_username
       FROM evidencia e
       LEFT JOIN usuarios u ON e.uploaded_by = u.id
       ORDER BY e.created_at DESC`
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error('Error al obtener historial de cargas:', err);
    res.status(500).json({ ok: false, error: 'Error al obtener el registro de cargas.' });
  }
}

module.exports = {
  uploadEvidencia,
  getEvidencias,
  getEvidenciaById,
  generateDownloadToken,
  downloadByToken,
  compartirEvidencia,
  descargarEvidenciaDirecta,
  deleteEvidencia,
  getAuditLog,
  getCargasHistorial
};
