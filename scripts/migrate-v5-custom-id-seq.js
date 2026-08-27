/**
 * migrate-v5-custom-id-seq.js
 * Migración v5: Secuencias de ID personalizadas (Prefijo 2026 + 1000 autoincremental)
 * Ej: 20261000, 20261001, 20261002...
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
    // Desactivar temporalmente verificación estricta de FK durante el re-mapeo de IDs
    await client.query("SET session_replication_role = 'replica';");

    console.log('1/4 — Actualizando registros existentes en tabla evidencia...');
    const evRows = (await client.query('SELECT id FROM evidencia ORDER BY id ASC')).rows;
    for (let i = 0; i < evRows.length; i++) {
      const oldId = evRows[i].id;
      const newId = 20261000 + i;

      if (oldId !== newId) {
        console.log(`   Renombrando Evidencia ID #${oldId} -> #${newId}`);
        await client.query('UPDATE evidencia SET id = $1 WHERE id = $2', [newId, oldId]);
        await client.query('UPDATE evidencia_compartida SET evidencia_id = $1 WHERE evidencia_id = $2', [newId, oldId]);
        await client.query('UPDATE solicitudes_evidencia SET evidencia_id = $1 WHERE evidencia_id = $2', [newId, oldId]);
        await client.query('UPDATE download_tokens SET evidencia_id = $1 WHERE evidencia_id = $2', [newId, oldId]);
      }
    }

    console.log('2/4 — Actualizando secuencia evidencia_id_seq...');
    const maxEvRes = await client.query('SELECT MAX(id) FROM evidencia');
    const maxEvId = maxEvRes.rows[0].max ? parseInt(maxEvRes.rows[0].max) : 20260999;
    const nextEvId = Math.max(20261000, maxEvId + 1);
    await client.query(`ALTER SEQUENCE evidencia_id_seq RESTART WITH ${nextEvId}`);
    console.log(`   ✅ Secuencia de Evidencia ajustada para iniciar en #${nextEvId}`);

    console.log('3/4 — Actualizando registros existentes en tabla solicitudes_evidencia...');
    const solRows = (await client.query('SELECT id FROM solicitudes_evidencia ORDER BY id ASC')).rows;
    for (let i = 0; i < solRows.length; i++) {
      const oldId = solRows[i].id;
      const newId = 20261000 + i;

      if (oldId !== newId) {
        console.log(`   Renombrando Solicitud ID #${oldId} -> #${newId}`);
        await client.query('UPDATE solicitudes_evidencia SET id = $1 WHERE id = $2', [newId, oldId]);
      }
    }

    console.log('4/4 — Actualizando secuencia solicitudes_evidencia_id_seq...');
    const maxSolRes = await client.query('SELECT MAX(id) FROM solicitudes_evidencia');
    const maxSolId = maxSolRes.rows[0].max ? parseInt(maxSolRes.rows[0].max) : 20260999;
    const nextSolId = Math.max(20261000, maxSolId + 1);
    await client.query(`ALTER SEQUENCE solicitudes_evidencia_id_seq RESTART WITH ${nextSolId}`);
    console.log(`   ✅ Secuencia de Solicitudes ajustada para iniciar en #${nextSolId}`);

    // Reactivar verificación de FKs
    await client.query("SET session_replication_role = 'origin';");
    await client.query('COMMIT');

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  Migración v5 (IDs 20261000+) completada exitosamente.');
    console.log('═══════════════════════════════════════════════════════════');

  } catch (err) {
    await client.query("SET session_replication_role = 'origin';");
    await client.query('ROLLBACK');
    console.error('❌ Error en migración v5:', err);
  } finally {
    client.release();
    pool.end();
  }
}

runMigration();
