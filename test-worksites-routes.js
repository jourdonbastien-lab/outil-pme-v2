'use strict';
const assert = require('assert');
const { registerWorksitesRoutes } = require('./routes/worksites');
const calls = []; const app = { get(url, middleware, handler) { calls.push(['GET', url, middleware, handler]); }, post(url, middleware, handler) { calls.push(['POST', url, middleware, handler]); } };
const login = () => {}; const handlers = { list() {}, create() {}, detail() {}, update() {} };
registerWorksitesRoutes(app, { requireLogin: login, handlers });
assert.deepStrictEqual(calls.map(([method, url]) => [method, url]), [['GET', '/chantiers'], ['POST', '/chantiers'], ['GET', '/chantiers/:id'], ['POST', '/chantiers/:id']]);
assert(calls.every((call) => call[2] === login)); assert.strictEqual(new Set(calls.map((call) => call[0] + call[1])).size, 4);
console.log('OK - routes chantiers');
