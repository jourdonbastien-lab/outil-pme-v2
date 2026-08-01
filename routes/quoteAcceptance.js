'use strict';

function registerQuoteAcceptanceRoute(app, { requireLogin, handlers } = {}) {
  if (!app || typeof app.post !== 'function') throw new TypeError('Application Express invalide.');
  if (typeof requireLogin !== 'function') throw new TypeError('Middleware requireLogin manquant.');
  if (!handlers || typeof handlers.accept !== 'function') throw new TypeError('Gestionnaire acceptation devis manquant.');
  app.post('/devis/:id/accept', requireLogin, handlers.accept);
}

module.exports = { registerQuoteAcceptanceRoute };
