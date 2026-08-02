'use strict';
const assert = require('assert');
const { registerQuoteDetailRoute } = require('./routes/quoteDetail');
const calls = []; const app = { get: (...args) => calls.push(args) };
const requireLogin = () => {}; const handler = () => {};
registerQuoteDetailRoute(app, { requireLogin, handler });
assert.deepStrictEqual(calls, [['/devis/:id', requireLogin, handler]]);
console.log('OK - route détail devis');
