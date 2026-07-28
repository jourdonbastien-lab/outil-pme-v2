'use strict';

function validate(app, requireLogin, handlers) {
  if (!app || typeof app.get !== 'function' || typeof app.post !== 'function') throw new TypeError('Application Express invalide.');
  if (typeof requireLogin !== 'function') throw new TypeError('Middleware requireLogin manquant.');
  if (!handlers) throw new TypeError('Gestionnaires pièces jointes devis manquants.');
}
function registerQuoteAttachmentUploadRoute(app, { requireLogin, handlers }) {
  validate(app, requireLogin, handlers);
  app.post('/devis/:id/photo', requireLogin, handlers.upload);
}
function registerQuoteAttachmentDeleteRoute(app, { requireLogin, handlers }) {
  validate(app, requireLogin, handlers);
  app.post('/devis/:id/photo/delete', requireLogin, handlers.delete);
}
function registerQuoteAttachmentFileRoute(app, { requireLogin, handlers }) {
  validate(app, requireLogin, handlers);
  app.get('/quote-photos/:id/:file', requireLogin, handlers.serve);
}
module.exports = { registerQuoteAttachmentUploadRoute, registerQuoteAttachmentDeleteRoute, registerQuoteAttachmentFileRoute };
