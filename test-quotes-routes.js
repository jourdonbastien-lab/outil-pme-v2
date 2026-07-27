'use strict';
const assert = require('assert');
const fs = require('fs');
const { registerQuoteRoutes } = require('./routes/quotes');
const routes = [];
const app = {
  get(path, ...handlers) { routes.push(['GET', path, ...handlers]); },
  post(path, ...handlers) { routes.push(['POST', path, ...handlers]); }
};
const requireLogin = () => {};
const handlers = { list() {}, createForm() {}, create() {} };
registerQuoteRoutes(app, { requireLogin, handlers });
assert.deepStrictEqual(routes.map((route) => route.slice(0, 2)), [
  ['GET', '/devis'],
  ['GET', '/devis/new'],
  ['POST', '/devis']
]);
assert(routes.every((route) => route[2] === requireLogin));
assert.strictEqual(routes[0][3], handlers.list);
assert.strictEqual(routes[1][3], handlers.createForm);
assert.strictEqual(routes[2][3], handlers.create);
const routeSource = fs.readFileSync('routes/quotes.js', 'utf8');
assert(!/SELECT |INSERT INTO|UPDATE |DELETE FROM|<form|fs\\./.test(routeSource));
const serverSource = fs.readFileSync('server.js', 'utf8');
assert(!serverSource.includes("app.get('/devis', requireLogin"));
assert(!serverSource.includes("app.get('/devis/new', requireLogin"));
assert(!serverSource.includes("app.post('/devis', requireLogin"));
assert(serverSource.includes("app.get('/devis/:id', requireLogin"));
assert(serverSource.indexOf('registerQuoteRoutes(app') < serverSource.indexOf("app.get('/devis/:id', requireLogin"));
console.log('OK - routes liste et création devis');
