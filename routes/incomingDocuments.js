'use strict';

function registerIncomingDocumentsRoutes(app, { requireAdmin, handlers }) {
  app.get('/documents-entrants', requireAdmin, handlers.list);
  app.get('/documents-entrants/:id/file', requireAdmin, handlers.file);
  app.post('/documents-entrants/upload', requireAdmin, handlers.upload);
  app.post('/documents-entrants/:id/classify', requireAdmin, handlers.classify);
  app.post('/documents-entrants/:id/reanalyze', requireAdmin, handlers.reanalyze);
  app.post('/documents-entrants/:id/reject', requireAdmin, handlers.reject);
}

module.exports = { registerIncomingDocumentsRoutes };
