'use strict';
const assert = require('assert');
const fs = require('fs');
const server = (fs.readFileSync('server.js', 'utf8') + fs.readFileSync('app/createApplication.js', 'utf8'));
for (const route of [
  "app.post('/devis/:id/notes'", "app.post('/devis/:id/status'", "app.post('/devis/:id/vat'",
  "app.get('/devis/line/:id/edit'", "app.post('/devis/line/:id/edit'", "app.post('/devis/line'",
  "app.post('/devis/line/delete'", "app.post('/devis/line/material'",
  "app.post('/devis/:id/margin'", "app.post('/devis/:id/delete'"
]) assert(!server.includes(route), route);
for (const preserved of [
  'registerQuoteDetailRoute(app',
  'registerQuoteAiAnalysisRoutes(app',
  'registerQuoteAcceptanceRoute(app'
]) assert(server.includes(preserved), preserved);
assert(fs.readFileSync('routes/quoteAttachments.js', 'utf8').includes("app.post('/devis/:id/photo', requireLogin"));
assert(server.includes('registerQuoteRoutes(app'));
assert(server.indexOf('registerQuoteHeaderSettingsRoutes(app') < server.indexOf('registerQuoteAttachmentUploadRoute(app'));
assert(server.indexOf('registerQuoteAttachmentDeleteRoute(app') < server.indexOf('registerQuoteLineEditRoutes(app'));
assert(server.indexOf('registerQuoteLineEditRoutes(app') < server.indexOf('registerQuoteAttachmentFileRoute(app'));
assert(server.indexOf('registerQuoteAttachmentFileRoute(app') < server.indexOf('registerQuoteLineMutationRoutes(app'));
assert(server.indexOf('registerQuoteLineMutationRoutes(app') < server.indexOf('registerQuoteAcceptanceRoute(app'));
assert(server.indexOf('registerQuoteAcceptanceRoute(app') < server.indexOf('registerQuoteFooterSettingsRoutes(app'));
for (const file of [
  'services/quoteLinesService.js', 'services/quoteSettingsService.js',
  'controllers/quoteLinesController.js', 'controllers/quoteSettingsController.js',
  'routes/quoteLines.js', 'routes/quoteSettings.js', 'views/quoteLineEditView.js'
]) assert(!fs.readFileSync(file, 'utf8').includes("require('../server"), file);
console.log('OK - architecture lignes et paramètres devis');
