'use strict';
const assert = require('assert');
const { createSupplierOrdersController } = require('./controllers/supplierOrdersController');
const calls = []; let purchaseExists = true;
const service = {
  listSupplierOrders: (query) => ({ query }), createSupplierOrder: (body) => calls.push(['create', body]),
  deleteSupplierOrder: (id) => calls.push(['delete', id]), completeSupplierOrder: (id) => calls.push(['complete', id]),
  updatePurchaseStatus: (...args) => { calls.push(['purchase', ...args]); return purchaseExists; }
};
const controller = createSupplierOrdersController({ supplierOrdersService: service,
  renderSupplierOrdersListView: (data, deps) => { calls.push(['view', data, deps]); return '<main>Fournisseurs</main>'; },
  pageTemplate: (_req, title, html) => `${title}:${html}`, viewDependencies: { icon: true } });
const response = () => ({ code: 200, body: null, location: null, status(c) { this.code = c; return this; }, send(b) { this.body = b; return this; }, redirect(v) { this.location = v; return this; } });
let res = response(); controller.showSupplierOrders({ query: { status: 'done' } }, res); assert(res.body.includes('Commandes fournisseurs'));
res = response(); controller.createSupplierOrder({ body: { name: 'A' } }, res); assert.strictEqual(res.location, '/orders/suppliers');
res = response(); controller.deleteSupplierOrder({ body: { id: 2 } }, res); assert.strictEqual(res.location, '/orders/suppliers');
res = response(); controller.completeSupplierOrder({ body: { id: 1 } }, res); assert.strictEqual(res.location, '/orders/suppliers');
res = response(); controller.updatePurchaseStatus({ params: { purchaseId: '8' }, body: { status: 'Reçu', redirect: 'https://evil' } }, res); assert.strictEqual(res.location, '/orders/suppliers#supplier-list');
purchaseExists = false; res = response(); controller.updatePurchaseStatus({ params: { purchaseId: '9' }, body: {} }, res); assert.deepStrictEqual([res.code, res.body], [404, 'Article introuvable']);
console.log('OK - contrôleur commandes fournisseurs');
