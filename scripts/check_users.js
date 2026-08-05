require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

async function checkUsers() {
  try {
    const res = await pool.query('SELECT username, role FROM usuarios');
    console.log('Usuarios en la base de datos:');
    res.rows.forEach(row => console.log(`- ${row.username} (${row.role})`));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}


checkUsers();
