'use strict';
const assert = require('assert');
const { registerQuoteProfitabilityRoutes } = require('./routes/quoteProfitability');
const calls = [];
const app = { get: (...args) => calls.push(['get', ...args]), post: (...args) => calls.push(['post', ...args]) };
const requireLogin = () => {}; const get = () => {}; const save = () => {};
registerQuoteProfitabilityRoutes(app, { requireLogin, handlers: { get, save } });
assert.deepStrictEqual(calls, [
  ['get', '/api/devis/:id/profitability', requireLogin, get],
  ['post', '/api/devis/:id/profitability', requireLogin, save]
]);
console.log('OK - routes rentabilité devis');
