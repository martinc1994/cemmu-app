const fs = require('fs');
const path = require('path');

const dirs = [
  'backend/config',
  'backend/controllers',
  'backend/middleware',
  'backend/routes',
  'frontend/public/css',
  'frontend/public/js',
  'frontend/public/img',
  'database'
];

// Create dirs
dirs.forEach(d => {
  const p = path.join(__dirname, '..', d);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

const moves = [
  { from: 'database.sql', to: 'database/schema.sql' },
  { from: 'styles.css', to: 'frontend/public/css/styles.css' },
  { from: 'app.js', to: 'frontend/public/js/app.js' },
  { from: 'dashboard.js', to: 'frontend/public/js/dashboard.js' },
  { from: 'theme.js', to: 'frontend/public/js/theme.js' },
  { from: 'logo.png', to: 'frontend/public/img/logo.png' },
  { from: 'logo_02.png', to: 'frontend/public/img/logo_02.png' },
  { from: 'index.html', to: 'frontend/public/index.html' },
  { from: 'login.html', to: 'frontend/public/login.html' },
  { from: 'admin.html', to: 'frontend/public/admin.html' },
  { from: 'reporte.html', to: 'frontend/public/reporte.html' },
  { from: 'dashboard.html', to: 'frontend/public/dashboard.html' }
];

moves.forEach(m => {
  const src = path.join(__dirname, '..', m.from);
  const dest = path.join(__dirname, '..', m.to);
  if (fs.existsSync(src)) {
    fs.renameSync(src, dest);
    console.log(`Movido ${m.from} -> ${m.to}`);
  }
});

console.log('Refactor de estructura completado.');
