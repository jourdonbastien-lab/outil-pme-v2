'use strict';

function registerQuoteAiAnalysisRoutes(app, { requireLogin, handlers } = {}) {
  if (!app || typeof app.get !== 'function' || typeof app.post !== 'function') throw new TypeError('Application Express invalide.');
  if (typeof requireLogin !== 'function') throw new TypeError('Middleware requireLogin manquant.');
  if (!handlers) throw new TypeError('Gestionnaires analyse IA devis manquants.');
  app.post('/api/devis/:id/profitability/analyze', requireLogin, handlers.review);
  app.post('/api/devis/:id/ai-review', requireLogin, handlers.review);
  app.get('/api/devis/:id/ai-reviews', requireLogin, handlers.list);
  app.post('/devis/:id/ai-costs', requireLogin, handlers.applyCosts);
}

module.exports = { registerQuoteAiAnalysisRoutes };
