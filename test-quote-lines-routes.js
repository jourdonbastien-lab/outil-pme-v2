'use strict';
const assert = require('assert');
const fs = require('fs');
const { registerQuoteLineEditRoutes, registerQuoteLineMutationRoutes } = require('./routes/quoteLines');
const routes = [];
const app = {
  get(path, ...handlers) { routes.push(['GET', path, ...handlers]); },
  post(path, ...handlers) { routes.push(['POST', path, ...handlers]); }
};
const requireLogin = () => {};
const handlers = { editForm() {}, update() {}, create() {}, delete() {}, createMaterial() {} };
registerQuoteLineEditRoutes(app, { requireLogin, handlers });
registerQuoteLineMutationRoutes(app, { requireLogin, handlers });
assert.deepStrictEqual(routes.map((route) => route.slice(0, 2)), [
  ['GET', '/devis/line/:id/edit'],
  ['POST', '/devis/line/:id/edit'],
  ['POST', '/devis/line'],
  ['POST', '/devis/line/delete'],
  ['POST', '/devis/line/material']
]);
assert(routes.every((route) => route[2] === requireLogin));
const source = fs.readFileSync('routes/quoteLines.js', 'utf8');
assert(!/SELECT |INSERT |UPDATE |DELETE FROM|<form|fs\\./.test(source));
console.log('OK - routes lignes devis');
