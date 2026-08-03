'use strict';

const assert = require('assert');
const fs = require('fs');
const { registerWorkshopToolsRoutes } = require('./routes/workshopTools');

const calls = [];
const app = { get(url, middleware, handler) { calls.push(['GET', url, middleware, handler]); } };
const requireLogin = () => {};
const handlers = {
  showLogibarre() {},
  showBarreaudage() {},
  showLogitole() {}
};

registerWorkshopToolsRoutes(app, { requireLogin, handlers });

assert.deepStrictEqual(calls.map(([method, url]) => [method, url]), [
  ['GET', '/outils/logibarre'],
  ['GET', '/outils/barreaudage'],
  ['GET', '/outils/logitole']
]);
assert(calls.every((call) => call[2] === requireLogin));
assert.deepStrictEqual(calls.map((call) => call[3]), [handlers.showLogibarre, handlers.showBarreaudage, handlers.showLogitole]);
assert.strictEqual(new Set(calls.map(([method, url]) => `${method} ${url}`)).size, 3);

const source = fs.readFileSync('routes/workshopTools.js', 'utf8');
assert(!/<(?:section|script|canvas|svg)\b/i.test(source));
assert(!/SELECT |INSERT INTO |UPDATE |DELETE FROM /.test(source));

console.log('OK - routes outils atelier');
