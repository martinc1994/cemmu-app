const Service = require('node-windows').Service;
const path = require('path');

// Crea un nuevo objeto de servicio de Windows
const svc = new Service({
  name: 'CeMMU Backend',
  description: 'Servicio del backend para el Centro de Monitoreo - Registro de Flota.',
  // Asegúrate de poner aquí el nombre de tu archivo principal que levanta el servidor Express
  script: path.join(__dirname, 'server.js'),
  env: [
    {
      name: "NODE_ENV",
      value: "production"
    }
  ]
});

// Escucha el evento "install", el cual se dispara cuando el servicio se registra correctamente
svc.on('install', function() {
  console.log('Servicio instalado exitosamente.');
  svc.start();
  console.log('Servicio iniciado y corriendo en segundo plano.');
});

svc.install();