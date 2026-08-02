'use strict';

function registerQuoteProfitabilityRoutes(app, { requireLogin, handlers } = {}) {
  if (!app || typeof app.get !== 'function' || typeof app.post !== 'function') throw new TypeError('Application Express invalide.');
  if (typeof requireLogin !== 'function') throw new TypeError('Middleware requireLogin manquant.');
  if (!handlers) throw new TypeError('Gestionnaires rentabilité devis manquants.');
  app.get('/api/devis/:id/profitability', requireLogin, handlers.get);
  app.post('/api/devis/:id/profitability', requireLogin, handlers.save);
}

module.exports = { registerQuoteProfitabilityRoutes };
