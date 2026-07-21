'use strict';

/**
 * Enregistre les routes propres aux commandes clients.
 * Les gestionnaires sont injectés afin que ce module ne dépende ni de la base
 * SQLite, ni de server.js, et afin de préserver leurs réponses à l’identique.
 */
function registerClientOrderRoutes(app, dependencies) {
  const {
    requireLogin,
    handlers
  } = dependencies;
  if (!app || typeof app.get !== 'function' || typeof app.post !== 'function') throw new TypeError('Application Express invalide.');
  if (typeof requireLogin !== 'function') throw new TypeError('Middleware requireLogin manquant.');
  if (!handlers || typeof handlers !== 'object') throw new TypeError('Gestionnaires de commandes clients manquants.');
  for (const name of [
    'create', 'update', 'done', 'updateChantier', 'profitabilityPage', 'profitabilityApi',
    'createActualCost', 'deleteActualCost', 'createCostLine', 'editCostLine',
    'duplicateCostLine', 'deleteCostLine', 'importQuoteCostLines', 'analyzeInvoice',
    'analyzeExistingInvoice', 'createInvoice', 'deleteInvoice',
    'addPurchase', 'updatePurchase', 'deletePurchase'
  ]) {
    if (typeof handlers[name] !== 'function') throw new TypeError(`Gestionnaire ${name} manquant.`);
  }

  const post = (route, name) => app.post(route, requireLogin, handlers[name]);
  const get = (route, name) => app.get(route, requireLogin, handlers[name]);

  post('/orders/client', 'create');
  post('/orders/client/:id/update', 'update');
  post('/orders/client/done', 'done');
  post('/orders/client/:id/chantier', 'updateChantier');

  get('/orders/client/:orderId/profitability', 'profitabilityPage');
  get('/api/orders/:id/profitability', 'profitabilityApi');
  post('/api/orders/:id/actual-costs', 'createActualCost');
  post('/api/orders/:id/actual-costs/:costId/delete', 'deleteActualCost');

  post('/orders/client/:orderId/cost-lines', 'createCostLine');
  post('/orders/client/:orderId/cost-lines/:lineId/edit', 'editCostLine');
  post('/orders/client/:orderId/cost-lines/:lineId/duplicate', 'duplicateCostLine');
  post('/orders/client/:orderId/cost-lines/:lineId/delete', 'deleteCostLine');
  post('/orders/client/:orderId/cost-lines/import-quote', 'importQuoteCostLines');

  post('/orders/client/:id/invoices/analyze', 'analyzeInvoice');
  post('/orders/client/:id/invoices/analyze-existing', 'analyzeExistingInvoice');
  post('/orders/client/:id/invoices/create', 'createInvoice');
  post('/orders/client/:id/invoices/:invoiceId/delete', 'deleteInvoice');

  post('/orders/client/:id/purchases', 'addPurchase');
  post('/orders/client/:id/purchases/:purchaseId/update', 'updatePurchase');
  post('/orders/client/:id/purchases/:purchaseId/delete', 'deletePurchase');
}

module.exports = { registerClientOrderRoutes };
