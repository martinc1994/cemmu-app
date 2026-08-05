/**
 * migrate-v2.js
 * Migración v2: Evidencia Digital + Gestión de Usuarios mejorada
 * 
 * Agrega:
 *   - Columnas nuevas a tabla usuarios (must_change_password, organization, full_name, etc.)
 *   - Tabla organizaciones
 *   - Tabla evidencia
 *   - Tabla download_tokens
 *   - Tabla audit_log
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

async function runMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ═══════════════════════════════════════════════════════════
    // 1. MEJORA DE TABLA USUARIOS
    // ═══════════════════════════════════════════════════════════
    console.log('1/5 — Actualizando tabla usuarios...');
    await client.query(`
      ALTER TABLE usuarios 
        ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;
    `);
    await client.query(`
      ALTER TABLE usuarios 
        ADD COLUMN IF NOT EXISTS organization VARCHAR(255) DEFAULT NULL;
    `);
    await client.query(`
      ALTER TABLE usuarios 
        ADD COLUMN IF NOT EXISTS full_name VARCHAR(255) DEFAULT NULL;
    `);
    await client.query(`
      ALTER TABLE usuarios 
        ADD COLUMN IF NOT EXISTS email VARCHAR(255) DEFAULT NULL;
    `);
    await client.query(`
      ALTER TABLE usuarios 
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
    `);
    await client.query(`
      ALTER TABLE usuarios 
        ADD COLUMN IF NOT EXISTS last_login TIMESTAMP DEFAULT NULL;
    `);
    await client.query(`
      ALTER TABLE usuarios 
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);
    console.log('   ✅ Tabla usuarios actualizada.');

    // ═══════════════════════════════════════════════════════════
    // 2. ORGANIZACIONES EXTERNAS
    // ═══════════════════════════════════════════════════════════
    console.log('2/5 — Creando tabla organizaciones...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS organizaciones (
          id SERIAL PRIMARY KEY,
          nombre VARCHAR(255) NOT NULL UNIQUE,
          tipo VARCHAR(100) NOT NULL,
          contacto VARCHAR(255),
          notas TEXT,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed inicial de organizaciones
    await client.query(`
      INSERT INTO organizaciones (nombre, tipo) VALUES
        ('CeMMU', 'Interno'),
        ('Ministerio Público Fiscal', 'MPF'),
        ('Fiscalía General', 'Fiscalia'),
        ('Juzgado de Instrucción N°1', 'Juzgado')
      ON CONFLICT (nombre) DO NOTHING;
    `);
    console.log('   ✅ Tabla organizaciones creada con datos iniciales.');

    // ═══════════════════════════════════════════════════════════
    // 3. EVIDENCIA DIGITAL
    // ═══════════════════════════════════════════════════════════
    console.log('3/5 — Creando tabla evidencia...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS evidencia (
          id SERIAL PRIMARY KEY,
          linea VARCHAR(255) NOT NULL,
          interno INTEGER NOT NULL,
          camara VARCHAR(50) NOT NULL,
          fecha_evento DATE NOT NULL,
          hora_evento TIME,
          descripcion TEXT NOT NULL,
          expediente VARCHAR(255),
          organismo_solicitante VARCHAR(255),
          nombre_archivo_original VARCHAR(500) NOT NULL,
          nombre_archivo_storage VARCHAR(500) NOT NULL,
          mime_type VARCHAR(100) NOT NULL,
          tamano_bytes BIGINT NOT NULL,
          checksum_sha256 VARCHAR(64) NOT NULL,
          uploaded_by INTEGER REFERENCES usuarios(id),
          status VARCHAR(50) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_evidencia_linea_interno ON evidencia(linea, interno);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_evidencia_fecha ON evidencia(fecha_evento);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_evidencia_expediente ON evidencia(expediente);`);
    console.log('   ✅ Tabla evidencia creada.');

    // ═══════════════════════════════════════════════════════════
    // 4. TOKENS DE DESCARGA TEMPORALES
    // ═══════════════════════════════════════════════════════════
    console.log('4/5 — Creando tabla download_tokens...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS download_tokens (
          id SERIAL PRIMARY KEY,
          token VARCHAR(128) NOT NULL UNIQUE,
          evidencia_id INTEGER REFERENCES evidencia(id) ON DELETE CASCADE,
          generated_by INTEGER REFERENCES usuarios(id),
          expires_at TIMESTAMP NOT NULL,
          max_downloads INTEGER DEFAULT 3,
          current_downloads INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_download_token ON download_tokens(token);`);
    console.log('   ✅ Tabla download_tokens creada.');

    // ═══════════════════════════════════════════════════════════
    // 5. LOG DE AUDITORÍA
    // ═══════════════════════════════════════════════════════════
    console.log('5/5 — Creando tabla audit_log...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES usuarios(id),
          username VARCHAR(100),
          action VARCHAR(100) NOT NULL,
          resource_type VARCHAR(50),
          resource_id INTEGER,
          details JSONB,
          ip_address VARCHAR(45),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);`);
    console.log('   ✅ Tabla audit_log creada.');

    await client.query('COMMIT');
    console.log('\n═══════════════════════════════════════');
    console.log('  Migración v2 completada exitosamente.');
    console.log('═══════════════════════════════════════');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error en migración v2:', err);
  } finally {
    client.release();
    pool.end();
  }
}

runMigration();
