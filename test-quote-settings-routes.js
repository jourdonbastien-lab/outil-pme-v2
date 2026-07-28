'use strict';
const assert = require('assert');
const fs = require('fs');
const { registerQuoteHeaderSettingsRoutes, registerQuoteFooterSettingsRoutes } = require('./routes/quoteSettings');
const routes = [];
const app = { post(path, ...handlers) { routes.push(['POST', path, ...handlers]); } };
const requireLogin = () => {};
const handlers = { notes() {}, status() {}, vat() {}, margin() {}, delete() {} };
registerQuoteHeaderSettingsRoutes(app, { requireLogin, handlers });
registerQuoteFooterSettingsRoutes(app, { requireLogin, handlers });
assert.deepStrictEqual(routes.map((route) => route.slice(0, 2)), [
  ['POST', '/devis/:id/notes'],
  ['POST', '/devis/:id/status'],
  ['POST', '/devis/:id/vat'],
  ['POST', '/devis/:id/margin'],
  ['POST', '/devis/:id/delete']
]);
assert(routes.every((route) => route[2] === requireLogin));
const source = fs.readFileSync('routes/quoteSettings.js', 'utf8');
assert(!/SELECT |INSERT |UPDATE |DELETE FROM|<form|fs\\./.test(source));
console.log('OK - routes paramètres devis');
