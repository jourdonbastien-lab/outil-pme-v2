'use strict';
const assert = require('assert');
const fs = require('fs');
const { registerQuoteSketchRoutes } = require('./routes/quoteSketches');
const routes = [];
const app = { get(path, ...handlers) { routes.push(['GET', path, ...handlers]); }, post(path, ...handlers) { routes.push(['POST', path, ...handlers]); } };
const requireLogin = () => {};
const handlers = { serve() {}, save() {} };
registerQuoteSketchRoutes(app, { requireLogin, handlers });
assert.deepStrictEqual(routes.map((route) => route.slice(0, 2)), [
  ['GET', '/sketches/quotes/:id.png'],
  ['POST', '/api/devis/:id/sketch']
]);
assert(routes.every((route) => route[2] === requireLogin));
const source = fs.readFileSync('routes/quoteSketches.js', 'utf8');
assert(!/fs\\.|SELECT |INSERT |UPDATE |DELETE FROM|<form/.test(source));
console.log('OK - routes croquis devis');
