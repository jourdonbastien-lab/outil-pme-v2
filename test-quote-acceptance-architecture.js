'use strict';
const assert = require('assert');
const fs = require('fs');
const server = fs.readFileSync('server.js', 'utf8');
const route = fs.readFileSync('routes/quoteAcceptance.js', 'utf8');
const service = fs.readFileSync('services/quoteAcceptanceService.js', 'utf8');
assert(!server.includes("app.post('/devis/:id/accept'"));
assert.strictEqual(route.split("'/devis/:id/accept'").length - 1, 1);
assert(server.includes('registerQuoteAcceptanceRoute(app'));
assert(server.indexOf('registerQuoteLineMutationRoutes(app') < server.indexOf('registerQuoteAcceptanceRoute(app'));
assert(server.indexOf('registerQuoteAcceptanceRoute(app') < server.indexOf('registerQuoteFooterSettingsRoutes(app'));
assert(!/\b(?:SELECT|INSERT|UPDATE|DELETE)\b/.test(route));
assert(!/\b(?:req|res)\./.test(service));
assert(!service.includes("require('../server"));
assert(!service.includes("new Database("));
for (const preserved of [
  'registerQuoteDetailRoute(app',
  'registerQuoteAiAnalysisRoutes(app',
  'registerQuoteAttachmentUploadRoute(app',
  'registerQuoteSketchRoutes(app',
  'registerQuoteLineMutationRoutes(app',
  'registerQuoteFooterSettingsRoutes(app',
  'registerQuoteRoutes(app'
]) assert(server.includes(preserved), preserved);
assert(server.includes('saveProjectForecast: clientOrderProfitabilityService.saveProjectForecast'));
assert(server.includes('importMissingQuoteCostLines: clientOrderProfitabilityService.importMissingQuoteCostLines'));
console.log('OK - architecture acceptation devis');
