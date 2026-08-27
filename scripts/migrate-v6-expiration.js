/**
 * migrate-v6-expiration.js
 * Migración v6: Control de expiración (30 días), límite de 4 descargas y columnas de auditoría
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

    console.log('1/2 — Agregando columnas de expiración y descargas en solicitudes_evidencia...');
    await client.query(`
      ALTER TABLE solicitudes_evidencia
        ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS max_downloads INTEGER DEFAULT 4,
        ADD COLUMN IF NOT EXISTS downloads_count INTEGER DEFAULT 0;
    `);
    console.log('   ✅ solicitudes_evidencia actualizada.');

    console.log('2/2 — Agregando columnas de expiración y descargas en evidencia_compartida...');
    await client.query(`
      ALTER TABLE evidencia_compartida
        ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS max_downloads INTEGER DEFAULT 4,
        ADD COLUMN IF NOT EXISTS downloads_count INTEGER DEFAULT 0;
    `);
    console.log('   ✅ evidencia_compartida actualizada.');

    await client.query('COMMIT');
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  Migración v6 (Expiración 30 días / 4 descargas) completada.');
    console.log('═══════════════════════════════════════════════════════════');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error en migración v6:', err);
  } finally {
    client.release();
    pool.end();
  }
}

runMigration();
