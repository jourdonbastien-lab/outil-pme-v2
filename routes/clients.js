'use strict';

function registerClientsRoutes(app, dependencies) {
  const { requireLogin, handlers } = dependencies || {};
  if (!app || typeof app.get !== 'function' || typeof app.post !== 'function') {
    throw new TypeError('Application Express invalide.');
  }
  if (typeof requireLogin !== 'function') throw new TypeError('Middleware requireLogin manquant.');
  if (!handlers) throw new TypeError('Gestionnaires clients manquants.');
  app.get('/clients', requireLogin, handlers.list);
  app.post('/clients', requireLogin, handlers.create);
  app.get('/clients/:client', requireLogin, handlers.show);
  app.post('/clients/delete', requireLogin, handlers.delete);
}

module.exports = { registerClientsRoutes };
