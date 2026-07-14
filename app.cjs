// Startpunt voor Phusion Passenger (cPanel → "Setup Node.js App").
// Passenger draait dit bestand met de gekozen Node-versie. Het laadt de
// gebundelde Express-server (CommonJS). Zet in de Node.js App als
// "Application startup file": app.cjs
require('./dist/server/index.cjs');
