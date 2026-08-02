'use strict';
const assert = require('assert');
const { createQuoteProfitabilityController } = require('./controllers/quoteProfitabilityController');
let exists = true;
const service = { quoteExists: () => exists, getQuoteProfitability: (id) => exists ? { quote: { id } } : null,
  profitabilityPublic: (ctx) => ({ quoteId: ctx.quote.id }), saveQuoteCostForecast: () => ({ quoteId: 7 }) };
const controller = createQuoteProfitabilityController({ profitabilityService: service, parseOptionalId: (v) => Number(v) || null });
const response = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
let res = response(); controller.getQuoteProfitability({ params: { id: '7' } }, res);
assert.deepStrictEqual(res.body, { success: true, profitability: { quoteId: 7 } });
res = response(); controller.getQuoteProfitability({ params: { id: 'x' } }, res); assert.strictEqual(res.code, 400);
exists = false; res = response(); controller.getQuoteProfitability({ params: { id: '7' } }, res); assert.strictEqual(res.code, 404);
exists = true; res = response(); controller.saveQuoteCostForecast({ params: { id: '7' }, body: {}, session: {} }, res);
assert.deepStrictEqual(res.body, { success: true, profitability: { quoteId: 7 } });
service.saveQuoteCostForecast = () => { throw new Error('Chiffrage test'); };
res = response(); controller.saveQuoteCostForecast({ params: { id: '7' }, body: {}, session: {} }, res);
assert.deepStrictEqual([res.code, res.body], [400, { success: false, error: 'Chiffrage test' }]);
console.log('OK - contrôleur rentabilité devis');
