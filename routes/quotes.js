'use strict';

function registerQuoteRoutes(app, dependencies) {
  const { requireLogin, handlers } = dependencies || {};
  if (!app || typeof app.get !== 'function' || typeof app.post !== 'function') {
    throw new TypeError('Application Express invalide.');
  }
  if (typeof requireLogin !== 'function') throw new TypeError('Middleware requireLogin manquant.');
  if (!handlers) throw new TypeError('Gestionnaires devis manquants.');
  for (const name of ['list', 'createForm', 'create']) {
    if (typeof handlers[name] !== 'function') throw new TypeError(`Gestionnaire ${name} manquant.`);
  }
  app.get('/devis', requireLogin, handlers.list);
  app.get('/devis/new', requireLogin, handlers.createForm);
  app.post('/devis', requireLogin, handlers.create);
}

module.exports = { registerQuoteRoutes };
