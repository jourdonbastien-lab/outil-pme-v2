'use strict';
const assert = require('assert');
const fs = require('fs');
const server = (fs.readFileSync('server.js', 'utf8') + fs.readFileSync('app/createApplication.js', 'utf8'));
const routes = fs.readFileSync('routes/clientOrders.js', 'utf8');
const folderRoutes = fs.readFileSync('routes/clientFolders.js', 'utf8');
for (const path of ['/orders/client/:id/purchases', '/orders/client/:id/purchases/:purchaseId/update', '/orders/client/:id/purchases/:purchaseId/delete']) {
  assert(routes.includes(`post('${path}'`), `route achat absente: ${path}`);
  assert(!server.includes(`app.post('${path}'`), `route achat dupliquée: ${path}`);
}
assert(routes.includes("get('/orders/clients', 'list')"), 'liste commandes non centralisée');
assert(!server.includes("app.get('/orders/clients', requireLogin"), 'route liste dupliquée dans server.js');
assert(folderRoutes.includes("app.get('/pc-folders/:client/:order/:type', requireLogin"), 'route dossier partagée absente');
assert(!server.includes("app.get('/pc-folders/:client/:order/:type', requireLogin"), 'route dossier dupliquée dans server.js');
console.log('OK - architecture domaine commandes clients');
