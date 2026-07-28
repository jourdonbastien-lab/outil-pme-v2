'use strict';

function validate(app, requireLogin, handlers) {
  if (!app || typeof app.get !== 'function' || typeof app.post !== 'function') throw new TypeError('Application Express invalide.');
  if (typeof requireLogin !== 'function') throw new TypeError('Middleware requireLogin manquant.');
  if (!handlers) throw new TypeError('Gestionnaires lignes devis manquants.');
}
function registerQuoteLineEditRoutes(app, { requireLogin, handlers }) {
  validate(app, requireLogin, handlers);
  app.get('/devis/line/:id/edit', requireLogin, handlers.editForm);
  app.post('/devis/line/:id/edit', requireLogin, handlers.update);
}
function registerQuoteLineMutationRoutes(app, { requireLogin, handlers }) {
  validate(app, requireLogin, handlers);
  app.post('/devis/line', requireLogin, handlers.create);
  app.post('/devis/line/delete', requireLogin, handlers.delete);
  app.post('/devis/line/material', requireLogin, handlers.createMaterial);
}
module.exports = { registerQuoteLineEditRoutes, registerQuoteLineMutationRoutes };
