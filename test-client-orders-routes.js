'use strict';

const assert = require('assert');
const fs = require('fs');
const routesSource = fs.readFileSync('routes/clientOrders.js', 'utf8');
const serverSource = fs.readFileSync('server.js', 'utf8');
const controllerSource = fs.readFileSync('controllers/clientOrderProfitabilityController.js', 'utf8');
const { registerClientOrderRoutes } = require('./routes/clientOrders');

assert.strictEqual(typeof registerClientOrderRoutes, 'function');
assert(!routesSource.includes("require('../server')"), 'import circulaire vers server.js');

const registered = [];
const app = {
  get(path, ...callbacks) { registered.push({ method: 'GET', path, callbacks }); },
  post(path, ...callbacks) { registered.push({ method: 'POST', path, callbacks }); }
};
const requireLogin = function requireLoginForTest(req, res, next) { next(); };
const handlerNames = [
  'create', 'update', 'done', 'updateChantier', 'profitabilityPage', 'profitabilityApi',
  'createActualCost', 'deleteActualCost', 'createCostLine', 'editCostLine',
  'duplicateCostLine', 'deleteCostLine', 'importQuoteCostLines', 'analyzeInvoice',
  'analyzeExistingInvoice', 'createInvoice', 'deleteInvoice'
];
const handlers = Object.fromEntries(handlerNames.map((name) => [name, function routeHandler() {}]));
registerClientOrderRoutes(app, { requireLogin, handlers });

const expected = [
  ['POST', '/orders/client'],
  ['POST', '/orders/client/:id/update'],
  ['POST', '/orders/client/done'],
  ['POST', '/orders/client/:id/chantier'],
  ['GET', '/orders/client/:orderId/profitability'],
  ['GET', '/api/orders/:id/profitability'],
  ['POST', '/api/orders/:id/actual-costs'],
  ['POST', '/api/orders/:id/actual-costs/:costId/delete'],
  ['POST', '/orders/client/:orderId/cost-lines'],
  ['POST', '/orders/client/:orderId/cost-lines/:lineId/edit'],
  ['POST', '/orders/client/:orderId/cost-lines/:lineId/duplicate'],
  ['POST', '/orders/client/:orderId/cost-lines/:lineId/delete'],
  ['POST', '/orders/client/:orderId/cost-lines/import-quote'],
  ['POST', '/orders/client/:id/invoices/analyze'],
  ['POST', '/orders/client/:id/invoices/analyze-existing'],
  ['POST', '/orders/client/:id/invoices/create'],
  ['POST', '/orders/client/:id/invoices/:invoiceId/delete']
];
assert.deepStrictEqual(registered.map(({ method, path }) => [method, path]), expected);
assert.strictEqual(new Set(registered.map(({ method, path }) => `${method} ${path}`)).size, registered.length, 'route enregistrée plusieurs fois');
for (const route of registered) {
  assert.strictEqual(route.callbacks.length, 2, `${route.method} ${route.path}: chaîne middleware modifiée`);
  assert.strictEqual(route.callbacks[0], requireLogin, `${route.method} ${route.path}: requireLogin absent`);
  assert.strictEqual(typeof route.callbacks[1], 'function');
}

assert(serverSource.includes("app.get('/orders/clients', requireLogin"), 'liste des commandes absente');
assert(serverSource.includes("app.get('/pc-folders/:client/:order', requireLogin"), 'dossier commande absent');
assert(serverSource.includes("app.get('/pc-folders/:client/:order/:type', requireLogin"), 'dossier Factures générique absent');
assert(serverSource.includes("type === 'Factures'"), 'branche Factures absente');
assert(serverSource.includes('registerClientOrderRoutes(app, {'));
assert(serverSource.includes('clientOrderFinancialSnapshot.getClientOrderFinancialSnapshot'));
assert(controllerSource.includes('financialSnapshot }'), 'structure JSON Rentabilité modifiée');
assert(!serverSource.includes('const handleClientOrderProfitabilityPage'));
assert(serverSource.includes('clientOrderProfitabilityController.showProfitability'));

for (const [, path] of expected) {
  assert(!serverSource.includes(`app.get('${path}'`) && !serverSource.includes(`app.post('${path}'`), `route extraite encore enregistrée dans server.js: ${path}`);
}

console.log('OK - extraction des routes commandes clients');
