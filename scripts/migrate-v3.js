/**
 * migrate-v3.js
 * Migración v3: Sistema de Solicitudes de Evidencia + Compartición Directa a Usuarios
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'cemmu_db',
  password: process.env.DB_PASSWORD || 'martinc1224',
  port: process.env.DB_PORT || 5432,
});

async function runMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('1/2 — Creando tabla solicitudes_evidencia...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS solicitudes_evidencia (
          id SERIAL PRIMARY KEY,
          solicitante_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
          solicitante_username VARCHAR(100) NOT NULL,
          organismo VARCHAR(255) NOT NULL,
          linea VARCHAR(255) NOT NULL,
          interno INTEGER NOT NULL,
          camara VARCHAR(50),
          fecha_evento DATE NOT NULL,
          hora_aproximada TIME,
          expediente VARCHAR(255) NOT NULL,
          motivo TEXT NOT NULL,
          prioridad VARCHAR(50) DEFAULT 'NORMAL',
          estado VARCHAR(50) DEFAULT 'PENDIENTE',
          evidencia_id INTEGER REFERENCES evidencia(id) ON DELETE SET NULL,
          respuesta_notas TEXT,
          atendido_por INTEGER REFERENCES usuarios(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_solicitudes_solicitante ON solicitudes_evidencia(solicitante_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_solicitudes_organismo ON solicitudes_evidencia(organismo);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_solicitudes_estado ON solicitudes_evidencia(estado);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_solicitudes_expediente ON solicitudes_evidencia(expediente);`);
    console.log('   ✅ Tabla solicitudes_evidencia creada.');

    console.log('2/2 — Creando tabla evidencia_compartida...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS evidencia_compartida (
          id SERIAL PRIMARY KEY,
          evidencia_id INTEGER REFERENCES evidencia(id) ON DELETE CASCADE,
          target_org VARCHAR(255),
          target_user_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
          shared_by INTEGER REFERENCES usuarios(id),
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_compartida_evidencia ON evidencia_compartida(evidencia_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_compartida_target_user ON evidencia_compartida(target_user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_compartida_target_org ON evidencia_compartida(target_org);`);
    console.log('   ✅ Tabla evidencia_compartida creada.');

    await client.query('COMMIT');
    console.log('\n═══════════════════════════════════════');
    console.log('  Migración v3 completada exitosamente.');
    console.log('═══════════════════════════════════════');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error en migración v3:', err);
  } finally {
    client.release();
    pool.end();
  }
}

runMigration();
