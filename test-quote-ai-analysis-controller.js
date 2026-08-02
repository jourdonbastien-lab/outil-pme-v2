'use strict';
const assert = require('assert');
const { createQuoteAiAnalysisController } = require('./controllers/quoteAiAnalysisController');
let exists = true; let applyError = null;
const service = { quoteExists: () => exists, reviewQuote: async (id) => exists ? { id } : null,
  listQuoteAiReviews: () => [{ id: 1 }], applyQuoteAiCosts: () => { if (applyError) throw applyError; } };
const controller = createQuoteAiAnalysisController({ aiAnalysisService: service, parseOptionalId: (v) => Number(v) || null });
const response = () => ({ code: 200, body: null, location: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, redirect(v) { this.location = v; return this; } });
(async () => {
  let res = response(); await controller.reviewQuote({ params: { id: '7' }, session: {} }, res); assert.strictEqual(res.body.success, true);
  res = response(); await controller.reviewQuote({ params: { id: 'x' }, session: {} }, res); assert.strictEqual(res.code, 400);
  exists = false; res = response(); await controller.reviewQuote({ params: { id: '7' }, session: {} }, res); assert.strictEqual(res.code, 404);
  exists = true; res = response(); controller.listQuoteAiReviews({ params: { id: '7' } }, res); assert.deepStrictEqual(res.body, { success: true, reviews: [{ id: 1 }] });
  res = response(); controller.applyQuoteAiCosts({ params: { id: '7' }, body: {} }, res); assert.strictEqual(res.location, '/devis/7#quote-ai-review-card');
  applyError = new Error('Coûts invalides test'); res = response(); controller.applyQuoteAiCosts({ params: { id: '7' }, body: {} }, res); assert.deepStrictEqual([res.code, res.body], [400, 'Coûts invalides test']);
  console.log('OK - contrôleur analyse IA devis');
})().catch((error) => { console.error(error); process.exitCode = 1; });
