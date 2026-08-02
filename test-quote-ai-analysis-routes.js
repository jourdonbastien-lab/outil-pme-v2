'use strict';
const assert = require('assert');
const { registerQuoteAiAnalysisRoutes } = require('./routes/quoteAiAnalysis');
const calls = []; const app = { get: (...args) => calls.push(['get', ...args]), post: (...args) => calls.push(['post', ...args]) };
const requireLogin = () => {}; const review = () => {}; const list = () => {}; const applyCosts = () => {};
registerQuoteAiAnalysisRoutes(app, { requireLogin, handlers: { review, list, applyCosts } });
assert.deepStrictEqual(calls, [
  ['post', '/api/devis/:id/profitability/analyze', requireLogin, review],
  ['post', '/api/devis/:id/ai-review', requireLogin, review],
  ['get', '/api/devis/:id/ai-reviews', requireLogin, list],
  ['post', '/devis/:id/ai-costs', requireLogin, applyCosts]
]);
console.log('OK - routes analyse IA devis');
