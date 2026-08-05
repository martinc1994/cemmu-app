const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');

const authRoutes = require('./backend/routes/auth.routes');
const registrosRoutes = require('./backend/routes/registros.routes');
const usuariosRoutes = require('./backend/routes/usuarios.routes');
const evidenciaRoutes = require('./backend/routes/evidencia.routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// serve static files
const publicDir = path.join(__dirname, 'frontend', 'public');
app.use(express.static(publicDir));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/registros', registrosRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/evidencia', evidenciaRoutes);

// Routing
const views = {
  '/':              'index.html',
  '/login':         'login.html',
  '/admin':         'admin.html',
  '/dashboard':     'dashboard.html',
  '/reporte':       'reporte.html',
  '/usuarios':      'usuarios.html',
  '/cambiar-clave': 'cambiar-clave.html',
  '/evidencia':     'evidencia.html',
  '/repositorio':   'repositorio.html',
};

Object.entries(views).forEach(([route, file]) => {
  app.get(route, (req, res) => {
    res.sendFile(path.join(publicDir, file));
  });
});

app.use((req, res) => {
  res.status(404).send('Página no encontrada.');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor CeMMU corriendo en http://0.0.0.0:${PORT}`);
});
