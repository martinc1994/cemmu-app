const pool = require('../config/db');

// Asegura que la tabla de unidades en servicio exista en la DB
async function initTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS unidades_servicio (
          id SERIAL PRIMARY KEY,
          fecha DATE NOT NULL,
          hora TIME NOT NULL,
          turno VARCHAR(50) NOT NULL,
          lineas_datos JSONB NOT NULL,
          total_unidades INTEGER NOT NULL,
          operador VARCHAR(255) NOT NULL,
          observaciones TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (err) {
    console.error('Error al inicializar tabla unidades_servicio:', err.message);
  }
}

// Inicializar tabla al cargar controlador
initTable();

// Obtener registros de unidades en servicio (filtrable por fecha y turno)
async function getUnidadesRegistros(req, res) {
  try {
    const { fecha, turno } = req.query;
    let query = 'SELECT * FROM unidades_servicio WHERE 1=1';
    let params = [];

    if (fecha) {
      params.push(fecha);
      query += ` AND fecha = $${params.length}`;
    }

    if (turno && turno !== 'Todos') {
      params.push(turno);
      query += ` AND turno = $${params.length}`;
    }

    query += ' ORDER BY fecha DESC, hora DESC LIMIT 500';

    const result = await pool.query(query, params);
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error('Error al obtener unidades en servicio:', err);
    res.status(500).json({ ok: false, error: 'Error al obtener registros de unidades.' });
  }
}

// Obtener un snapshot específico por ID
async function getUnidadesRegistroById(req, res) {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM unidades_servicio WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Registro no encontrado.' });
    }

    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error al obtener snapshot de unidades:', err);
    res.status(500).json({ ok: false, error: 'Error al obtener el registro.' });
  }
}

// Crear un nuevo snapshot / carga de unidades en servicio
async function createUnidadesRegistro(req, res) {
  try {
    const now = new Date();
    const fecha = req.body.fecha || now.toISOString().slice(0, 10);
    const hora = req.body.hora || now.toTimeString().slice(0, 8);
    const turno = req.body.turno || (parseInt(hora.slice(0, 2), 10) < 14 ? 'Mañana' : 'Tarde');
    const lineas_datos = req.body.lineas_datos || {};
    const observaciones = req.body.observaciones || '';

    // Obtener nombre del operador autenticado
    const operador = req.user?.full_name || req.user?.username || 'Admin';

    // Calcular la suma total de unidades entre todas las líneas cargadas
    let total_unidades = 0;
    if (typeof lineas_datos === 'object' && lineas_datos !== null) {
      Object.values(lineas_datos).forEach(val => {
        const num = parseInt(val, 10);
        if (!isNaN(num) && num > 0) {
          total_unidades += num;
        }
      });
    }

    const result = await pool.query(
      `INSERT INTO unidades_servicio (fecha, hora, turno, lineas_datos, total_unidades, operador, observaciones)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [fecha, hora, turno, JSON.stringify(lineas_datos), total_unidades, operador, observaciones]
    );

    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error al guardar registro de unidades:', err);
    res.status(500).json({ ok: false, error: 'Error al guardar la carga de unidades.' });
  }
}

// Actualizar un registro existente
async function updateUnidadesRegistro(req, res) {
  try {
    const { id } = req.params;
    const { fecha, hora, turno, lineas_datos, observaciones } = req.body;

    let total_unidades = 0;
    if (typeof lineas_datos === 'object' && lineas_datos !== null) {
      Object.values(lineas_datos).forEach(val => {
        const num = parseInt(val, 10);
        if (!isNaN(num) && num > 0) {
          total_unidades += num;
        }
      });
    }

    const operador = req.user?.full_name || req.user?.username || 'Admin';

    const result = await pool.query(
      `UPDATE unidades_servicio
       SET fecha = $1, hora = $2, turno = $3, lineas_datos = $4, total_unidades = $5, operador = $6, observaciones = $7, updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [fecha, hora, turno, JSON.stringify(lineas_datos), total_unidades, operador, observaciones || '', id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Registro no encontrado.' });
    }

    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error al actualizar registro de unidades:', err);
    res.status(500).json({ ok: false, error: 'Error al actualizar el registro.' });
  }
}

// Eliminar un registro
async function deleteUnidadesRegistro(req, res) {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM unidades_servicio WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Registro no encontrado.' });
    }

    res.json({ ok: true, message: `Registro ${id} eliminado correctamente.` });
  } catch (err) {
    console.error('Error al eliminar registro de unidades:', err);
    res.status(500).json({ ok: false, error: 'Error al eliminar el registro.' });
  }
}

module.exports = {
  getUnidadesRegistros,
  getUnidadesRegistroById,
  createUnidadesRegistro,
  updateUnidadesRegistro,
  deleteUnidadesRegistro
};
