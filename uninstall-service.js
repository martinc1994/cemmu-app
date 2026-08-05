const Service = require('node-windows').Service;
const path = require('path');

const svc = new Service({
  name: 'CeMMU Backend',
  script: path.join(__dirname, 'server.js') // Debe coincidir con el archivo de instalación
});

// Escucha el evento "uninstall"
svc.on('uninstall', function() {
  console.log('El servicio de Windows ha sido desinstalado correctamente.');
});

// Desinstala el servicio
svc.uninstall();