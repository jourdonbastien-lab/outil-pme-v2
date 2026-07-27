'use strict';
const assert = require('assert');
const fs = require('fs');
for (const file of [
  'routes/quotes.js',
  'controllers/quotesController.js',
  'services/quotesService.js',
  'views/quotesListView.js',
  'views/quoteCreateView.js'
]) {
  const source = fs.readFileSync(file, 'utf8');
  assert(!source.includes("require('../server"), `${file}: import server.js`);
}
const server = fs.readFileSync('server.js', 'utf8');
for (const definition of [
  "app.get('/devis', requireLogin",
  "app.get('/devis/new', requireLogin",
  "app.post('/devis', requireLogin"
]) assert(!server.includes(definition), `route inline restante: ${definition}`);
assert(server.includes("app.get('/devis/:id', requireLogin"));
assert(server.includes("app.post('/devis/line', requireLogin"));
assert(server.includes("app.post('/devis/:id/accept', requireLogin"));
console.log('OK - architecture liste et création devis');
