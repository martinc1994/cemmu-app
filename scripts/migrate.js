require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

const DB_USERS = [
  { username: "PVeliz", password: "161211", role: "admin" },
  { username: "LFernandez", password: "luciaf2026", role: "admin" },
  { username: "MCortez", password: "mcortez2026", role: "admin" },
  { username: "AMoya", password: "ale1375", role: "operador" },
  { username: "LCarrer", password: "Martes17+NSSA", role: "operador" },
  { username: "DSanchez", password: "desis2026", role: "operador" },
  { username: "NGuanco", password: "Esme2019", role: "admin" },
  { username: "MCastillo", password: "martinc1224", role: "admin" }

];

async function runMigration() {
  try {
    // 1. Create table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
          id SERIAL PRIMARY KEY,
          username VARCHAR(100) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(50) DEFAULT 'operador',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Tabla 'usuarios' creada o ya existe.");

    // 2. Insert or Update users
    for (const user of DB_USERS) {
      // Encriptar password
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(user.password, salt);
      
      await pool.query(`
        INSERT INTO usuarios (username, password_hash, role) 
        VALUES ($1, $2, $3)
        ON CONFLICT (username) 
        DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role;
      `, [user.username, hash, user.role]);
      
      console.log(`Usuario procesado (inserción/actualización): ${user.username}`);
    }

    console.log("Migración completada exitosamente.");
  } catch (err) {
    console.error("Error en migración:", err);
  } finally {
    pool.end();
  }
}

runMigration();
