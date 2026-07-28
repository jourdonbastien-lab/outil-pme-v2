'use strict';

function validate(app, requireLogin, handlers) {
  if (!app || typeof app.post !== 'function') throw new TypeError('Application Express invalide.');
  if (typeof requireLogin !== 'function') throw new TypeError('Middleware requireLogin manquant.');
  if (!handlers) throw new TypeError('Gestionnaires paramètres devis manquants.');
}
function registerQuoteHeaderSettingsRoutes(app, { requireLogin, handlers }) {
  validate(app, requireLogin, handlers);
  app.post('/devis/:id/notes', requireLogin, handlers.notes);
  app.post('/devis/:id/status', requireLogin, handlers.status);
  app.post('/devis/:id/vat', requireLogin, handlers.vat);
}
function registerQuoteFooterSettingsRoutes(app, { requireLogin, handlers }) {
  validate(app, requireLogin, handlers);
  app.post('/devis/:id/margin', requireLogin, handlers.margin);
  app.post('/devis/:id/delete', requireLogin, handlers.delete);
}
module.exports = { registerQuoteHeaderSettingsRoutes, registerQuoteFooterSettingsRoutes };
