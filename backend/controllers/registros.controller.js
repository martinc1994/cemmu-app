const pool = require('../config/db');

async function getRegistros(req, res) {
  try {
    const { fecha, fecha_inicio, fecha_fin, turno } = req.query;
    let query = 'SELECT * FROM vw_registros_flota WHERE 1=1';
    let params = [];

    if (fecha) {
      params.push(fecha);
      query += ` AND fecha = $${params.length}`;
    } else if (fecha_inicio && fecha_fin) {
      params.push(fecha_inicio, fecha_fin);
      query += ` AND fecha BETWEEN $${params.length - 1} AND $${params.length}`;
    }

    if (turno && turno !== 'Todos') {
      params.push(turno);
      query += ` AND turno_guardado = $${params.length}`;
    }

    query += ' ORDER BY fecha DESC, hora DESC LIMIT 2000';

    const result = await pool.query(query, params);
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error('Error al obtener registros:', err);
    res.status(500).json({ ok: false, error: 'Error al obtener registros.' });
  }
}

async function createRegistro(req, res) { 
  try {
    const now = new Date();
    const fecha = req.body.fecha || now.toISOString().slice(0, 10);
    const hora = req.body.hora || now.toTimeString().slice(0, 8);
    const status = 'OK';
    const { direccion, linea, interno, operador, observaciones } = req.body;

    if (!direccion || !linea || !interno || !operador) {
      return res.status(400).json({ ok: false, error: 'Faltan campos obligatorios.' });
    }

    const result = await pool.query(
      `INSERT INTO registros_flota (fecha, hora, direccion, linea, interno, operador, observaciones, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [fecha, hora, direccion, linea, interno, operador, observaciones || '', status]
    );
    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error al crear registro:', err);
    res.status(500).json({ ok: false, error: 'Error al crear registro.' });
  }
}

async function updateRegistro(req, res) {
  try {
    const { id } = req.params;
    const { fecha, hora, direccion, linea, interno, operador, observaciones } = req.body;

    const result = await pool.query(
      `UPDATE registros_flota
       SET fecha=$1, hora=$2, direccion=$3, linea=$4, interno=$5, operador=$6, observaciones=$7
       WHERE id=$8 RETURNING *`,
      [fecha, hora, direccion, linea, interno, operador, observaciones, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Registro no encontrado.' });
    }
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error al actualizar registro:', err);
    res.status(500).json({ ok: false, error: 'Error al actualizar registro.' });
  }
}

async function deleteRegistro(req, res) {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM registros_flota WHERE id=$1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Registro no encontrado.' });
    }
    res.json({ ok: true, message: `Registro ${id} eliminado.` });
  } catch (err) {
    console.error('Error al eliminar registro:', err);
    res.status(500).json({ ok: false, error: 'Error al eliminar registro.' });
  }
}

module.exports = { getRegistros, createRegistro, updateRegistro, deleteRegistro };
