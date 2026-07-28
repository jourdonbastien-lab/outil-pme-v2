'use strict';

function registerQuoteSketchRoutes(app, { requireLogin, handlers }) {
  if (!app || typeof app.get !== 'function' || typeof app.post !== 'function') throw new TypeError('Application Express invalide.');
  if (typeof requireLogin !== 'function') throw new TypeError('Middleware requireLogin manquant.');
  if (!handlers) throw new TypeError('Gestionnaires croquis devis manquants.');
  app.get('/sketches/quotes/:id.png', requireLogin, handlers.serve);
  app.post('/api/devis/:id/sketch', requireLogin, handlers.save);
}

module.exports = { registerQuoteSketchRoutes };
