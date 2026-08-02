'use strict';

function registerQuoteDetailRoute(app, { requireLogin, handler } = {}) {
  if (!app || typeof app.get !== 'function') throw new TypeError('Application Express invalide.');
  if (typeof requireLogin !== 'function') throw new TypeError('Middleware requireLogin manquant.');
  if (typeof handler !== 'function') throw new TypeError('Gestionnaire détail devis manquant.');
  app.get('/devis/:id', requireLogin, handler);
}

module.exports = { registerQuoteDetailRoute };
