'use strict';
const assert = require('assert');
const fs = require('fs');
const server = fs.readFileSync('server.js', 'utf8');
const profitabilityRoutes = fs.readFileSync('routes/quoteProfitability.js', 'utf8');
const aiRoutes = fs.readFileSync('routes/quoteAiAnalysis.js', 'utf8');
for (const route of [
  "app.get('/api/devis/:id/profitability'", "app.post('/api/devis/:id/profitability'",
  "app.post('/api/devis/:id/profitability/analyze'", "app.post('/api/devis/:id/ai-review'",
  "app.get('/api/devis/:id/ai-reviews'", "app.post('/devis/:id/ai-costs'"
]) assert(!server.includes(route), route);
for (const path of ['/api/devis/:id/profitability', '/api/devis/:id/profitability/analyze', '/api/devis/:id/ai-review', '/api/devis/:id/ai-reviews', '/devis/:id/ai-costs']) {
  const modules = profitabilityRoutes + aiRoutes;
  assert.strictEqual(modules.split(`'${path}'`).length - 1, path === '/api/devis/:id/profitability' ? 2 : 1, path);
}
assert(server.indexOf('registerQuoteProfitabilityRoutes(app') < server.indexOf('registerQuoteAiAnalysisRoutes(app'));
assert(server.indexOf('registerQuoteAiAnalysisRoutes(app') < server.indexOf("app.get('/devis/:id', requireLogin"));
for (const preserved of ['registerQuoteAcceptanceRoute(app', 'registerQuoteAttachmentUploadRoute(app', 'registerQuoteSketchRoutes(app', 'registerQuoteLineMutationRoutes(app', 'registerQuoteRoutes(app']) assert(server.includes(preserved), preserved);
for (const file of ['services/quoteProfitabilityService.js', 'services/quoteAiAnalysisService.js']) {
  const source = fs.readFileSync(file, 'utf8'); assert(!/\b(?:req|res)\./.test(source)); assert(!source.includes("require('../server"));
}
assert(!/\b(?:SELECT|INSERT|UPDATE|DELETE)\b/.test(profitabilityRoutes + aiRoutes));
assert(server.includes("app.get('/devis/:id', requireLogin"));
assert(server.includes('quoteProfitabilityService.getQuoteProfitability(id)'));
assert.strictEqual((fs.readFileSync('lib/quoteAiReview.js', 'utf8') + fs.readFileSync('services/quoteAiAnalysisService.js', 'utf8')).split('Tu es un contrôleur de devis spécialisé').length - 1, 1);
console.log('OK - architecture analyse, rentabilité et IA devis');
