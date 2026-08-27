/**
 * migrate-v4.js
 * Migración v4: Instrumento Legal obligatorio en solicitudes + campos de compartición en subida de evidencia
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

    console.log('1/1 — Actualizando tabla solicitudes_evidencia...');
    await client.query(`
      ALTER TABLE solicitudes_evidencia
        ADD COLUMN IF NOT EXISTS instrumento_archivo_original VARCHAR(500),
        ADD COLUMN IF NOT EXISTS instrumento_archivo_storage VARCHAR(500),
        ADD COLUMN IF NOT EXISTS instrumento_mime_type VARCHAR(100),
        ADD COLUMN IF NOT EXISTS instrumento_tamano_bytes BIGINT;
    `);
    console.log('   ✅ Columnas de instrumento legal agregadas.');

    await client.query('COMMIT');
    console.log('\n═══════════════════════════════════════');
    console.log('  Migración v4 completada exitosamente.');
    console.log('═══════════════════════════════════════');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error en migración v4:', err);
  } finally {
    client.release();
    pool.end();
  }
}

runMigration();
