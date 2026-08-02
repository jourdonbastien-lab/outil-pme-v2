'use strict';
const assert = require('assert');
const { registerSupplierOrderRoutes, registerSupplierOrderCompletionRoutes } = require('./routes/supplierOrders');
const calls = []; const app = { get: (...args) => calls.push(['get', ...args]), post: (...args) => calls.push(['post', ...args]) };
const requireLogin = () => {}; const handlers = { list() {}, create() {}, delete() {}, updatePurchaseStatus() {}, complete() {} };
registerSupplierOrderRoutes(app, { requireLogin, handlers }); registerSupplierOrderCompletionRoutes(app, { requireLogin, handlers });
assert.deepStrictEqual(calls, [
  ['get', '/orders/suppliers', requireLogin, handlers.list], ['post', '/orders/supplier', requireLogin, handlers.create],
  ['post', '/orders/supplier/delete', requireLogin, handlers.delete], ['post', '/orders/suppliers/purchases/:purchaseId/status', requireLogin, handlers.updatePurchaseStatus],
  ['post', '/orders/suppliers/done', requireLogin, handlers.complete], ['post', '/orders/suppliers/delete', requireLogin, handlers.delete]
]);
console.log('OK - routes commandes fournisseurs');
