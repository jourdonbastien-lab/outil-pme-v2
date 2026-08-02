'use strict';

function validate(app, requireLogin, handlers) {
  if (!app || typeof app.get !== 'function' || typeof app.post !== 'function') throw new TypeError('Application Express invalide.');
  if (typeof requireLogin !== 'function') throw new TypeError('Middleware requireLogin manquant.');
  if (!handlers) throw new TypeError('Gestionnaires commandes fournisseurs manquants.');
}
function registerSupplierOrderRoutes(app, { requireLogin, handlers }) {
  validate(app, requireLogin, handlers);
  app.get('/orders/suppliers', requireLogin, handlers.list);
  app.post('/orders/supplier', requireLogin, handlers.create);
  app.post('/orders/supplier/delete', requireLogin, handlers.delete);
  app.post('/orders/suppliers/purchases/:purchaseId/status', requireLogin, handlers.updatePurchaseStatus);
}
function registerSupplierOrderCompletionRoutes(app, { requireLogin, handlers }) {
  validate(app, requireLogin, handlers);
  app.post('/orders/suppliers/done', requireLogin, handlers.complete);
  app.post('/orders/suppliers/delete', requireLogin, handlers.delete);
}

module.exports = { registerSupplierOrderRoutes, registerSupplierOrderCompletionRoutes };
