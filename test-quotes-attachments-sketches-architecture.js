'use strict';
const assert = require('assert');
const fs = require('fs');
const server = (fs.readFileSync('server.js', 'utf8') + fs.readFileSync('app/createApplication.js', 'utf8'));
for (const route of [
  "app.post('/devis/:id/photo'",
  "app.get('/sketches/quotes/:id.png'",
  "app.post('/api/devis/:id/sketch'",
  "app.post('/devis/:id/photo/delete'"
]) assert(!server.includes(route), route);
assert(!server.includes("'/quote-photos/:id/:file',\n  requireLogin"));
for (const preserved of [
  'registerQuoteDetailRoute(app',
  'registerQuoteAiAnalysisRoutes(app',
  'registerQuoteAcceptanceRoute(app'
]) assert(server.includes(preserved), preserved);
assert(server.indexOf('registerQuoteAttachmentUploadRoute(app') < server.indexOf('registerQuoteSketchRoutes(app'));
assert(server.indexOf('registerQuoteSketchRoutes(app') < server.indexOf('registerQuoteDetailRoute(app'));
assert(server.indexOf('registerQuoteDetailRoute(app') < server.indexOf('registerQuoteAttachmentDeleteRoute(app'));
assert(server.indexOf('registerQuoteAttachmentDeleteRoute(app') < server.indexOf('registerQuoteLineEditRoutes(app'));
assert(server.indexOf('registerQuoteLineEditRoutes(app') < server.indexOf('registerQuoteAttachmentFileRoute(app'));
assert(server.indexOf('registerQuoteAttachmentFileRoute(app') < server.indexOf('registerQuoteLineMutationRoutes(app'));
assert(server.includes('removeQuotePhotos: quoteAttachmentsService.deleteAllQuotePhotos'));
assert(server.includes('removeQuoteSketch: quoteSketchesService.deleteQuoteSketch'));
for (const file of [
  'services/quoteAttachmentsService.js', 'services/quoteSketchesService.js',
  'controllers/quoteAttachmentsController.js', 'controllers/quoteSketchesController.js',
  'routes/quoteAttachments.js', 'routes/quoteSketches.js'
]) assert(!fs.readFileSync(file, 'utf8').includes("require('../server"), file);
console.log('OK - architecture pièces jointes et croquis devis');
