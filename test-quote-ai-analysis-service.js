'use strict';
const assert = require('assert');
const { createQuoteAiAnalysisService } = require('./services/quoteAiAnalysisService');
const quoteAiReviewEngine = require('./lib/quoteAiReview');
const writes = []; let transactionCount = 0; let fetchCall = null;
const db = {
  prepare(sql) { return {
    get: () => ({ id: 7 }), all: () => [],
    run: (...args) => { writes.push({ sql, args }); return { lastInsertRowid: 9, changes: 1 }; }
  }; },
  transaction(fn) { return () => { transactionCount += 1; return fn(); }; }
};
const profitabilityService = { getQuoteProfitability: () => ({
  quote: { id: 7, title: 'Portail' }, input: { id: 7, title: 'Portail' }, lines: [{ label: 'Acier', qty: 1, unit_price: 100, total: 100 }],
  calculations: { reliability: 'complete', engineVersion: 5 }
}) };
const quoteAiReview = {
  ...quoteAiReviewEngine,
  calculateAutomaticLineReview: () => ({ riskLevel: 'green', summary: { totalHT: 100, costPrice: 60, marginAmount: 40, marginOnCost: 66.67, marginOnSale: 40 }, warnings: [], positivePoints: [], recommendation: 'OK' }),
  sanitizeAiReview: (p) => p
};
const base = { db, profitabilityService, quoteAiReview,
  projectProfitability: { WORK_CATEGORIES: ['portail'] }, costFields: ['cout_revient'], model: 'modele-test',
  getApiKey: () => '', fetchImpl: async () => { throw new Error('réseau interdit'); }, AbortControllerImpl: class { constructor() { this.signal = {}; } abort() {} },
  parseOptionalId: Number, now: () => 'NOW', logError() {} };
const service = createQuoteAiAnalysisService(base);
service.reviewQuote(7, 3).then(async (review) => {
  assert.strictEqual(review.ai.used, false);
  assert.strictEqual(writes.length, 2);
  assert.strictEqual(writes[1].args[9], null);
  service.applyQuoteAiCosts(7, { work_category: 'portail', cout_revient: '12,5' });
  assert.strictEqual(transactionCount, 1);
  assert.strictEqual(writes.at(-2).args[0], 12.5);
  assert.throws(() => service.applyQuoteAiCosts(7, { work_category: 'bad' }), /Catégorie d’ouvrage invalide/);
  assert.throws(() => service.applyQuoteAiCosts(7, { cout_revient: '-1' }), /Valeur invalide/);
  const networkService = createQuoteAiAnalysisService({ ...base, getApiKey: () => 'secret-test',
    fetchImpl: async (url, options) => { fetchCall = { url, options }; return { ok: true, json: async () => ({ output_text: '```json\n{"riskLevel":"orange","warnings":[],"positivePoints":[],"recommendation":"Vérifier"}\n```' }) }; },
    setTimeoutImpl: (fn, ms) => { assert.strictEqual(ms, 30000); return 1; }, clearTimeoutImpl: () => {} });
  const ai = await networkService.requestOpenAiQuoteReview({ id: 7, title: 'Portail' }, [], { riskLevel: 'green', summary: {}, warnings: [] });
  assert.strictEqual(ai.used, true);
  assert.strictEqual(JSON.parse(fetchCall.options.body).model, 'modele-test');
  assert(!fetchCall.options.body.includes('secret-test'));
  console.log('OK - service analyse IA devis');
}).catch((error) => { console.error(error); process.exitCode = 1; });
