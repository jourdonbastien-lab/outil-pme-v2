'use strict';
const assert = require('assert');
const fs = require('fs');
const server = fs.readFileSync('server.js', 'utf8'); const routes = fs.readFileSync('routes/supplierOrders.js', 'utf8');
for (const route of ["app.get('/orders/suppliers'", "app.post('/orders/supplier'", "app.post('/orders/supplier/delete'", "app.post('/orders/suppliers/purchases/:purchaseId/status'", "app.post('/orders/suppliers/done'", "app.post('/orders/suppliers/delete'"]) assert(!server.includes(route), route);
for (const path of ['/orders/suppliers', '/orders/supplier', '/orders/supplier/delete', '/orders/suppliers/purchases/:purchaseId/status', '/orders/suppliers/done', '/orders/suppliers/delete']) assert.strictEqual(routes.split(`'${path}'`).length - 1, 1, path);
assert(server.indexOf('registerSupplierOrderRoutes(app') < server.indexOf('registerPcFoldersAliasRoute(app'));
assert(server.indexOf('registerTasksMutationRoutes(app') < server.indexOf('registerSupplierOrderCompletionRoutes(app'));
assert(server.indexOf('registerSupplierOrderCompletionRoutes(app') < server.indexOf('registerAgendaMutationRoutes(app'));
for (const file of ['routes/supplierOrders.js', 'controllers/supplierOrdersController.js', 'services/supplierOrdersService.js', 'views/supplierOrdersListView.js', 'views/supplierOrderCardView.js']) { const source = fs.readFileSync(file, 'utf8'); assert(!source.includes("require('../server")); }
assert(!/\b(?:SELECT|INSERT|UPDATE|DELETE)\b/.test(routes + fs.readFileSync('views/supplierOrdersListView.js', 'utf8') + fs.readFileSync('views/supplierOrderCardView.js', 'utf8')));
assert(!/\b(?:req|res)\./.test(fs.readFileSync('services/supplierOrdersService.js', 'utf8')));
assert(server.includes('registerClientOrderRoutes(app'));
assert(server.includes('registerQuoteDetailRoute(app'));
assert(server.includes('registerTasksMutationRoutes(app'));
console.log('OK - architecture commandes fournisseurs');
