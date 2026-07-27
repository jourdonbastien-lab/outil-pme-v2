'use strict';
const assert = require('assert');
const fs = require('fs');
const { registerClientsRoutes, registerPcFoldersAliasRoute } = require('./routes/clients');
const calls = [];
const app = {
  get(path, ...handlers) { calls.push(['GET', path, ...handlers]); },
  post(path, ...handlers) { calls.push(['POST', path, ...handlers]); }
};
const middleware = () => {};
const handlers = { list() {}, create() {}, show() {}, delete() {} };
registerClientsRoutes(app, { requireLogin: middleware, handlers });
assert.deepStrictEqual(calls.map((call) => call.slice(0, 2)), [
  ['GET', '/clients'],
  ['POST', '/clients'],
  ['GET', '/clients/:client'],
  ['POST', '/clients/delete']
]);
assert(calls.every((call) => call[2] === middleware));
assert.strictEqual(calls[0][3], handlers.list);
assert.strictEqual(calls[3][3], handlers.delete);
const redirectPcFoldersToClients = () => {};
registerPcFoldersAliasRoute(app, { requireLogin: middleware, redirectPcFoldersToClients });
assert.deepStrictEqual(calls[4], ['GET', '/pc-folders', middleware, redirectPcFoldersToClients]);
assert.strictEqual(calls.filter((call) => call[0] === 'GET' && call[1] === '/pc-folders').length, 1);
const source = fs.readFileSync(require.resolve('./routes/clients'), 'utf8');
assert(!/SELECT|INSERT|DELETE FROM|<form|fs\\./.test(source));
console.log('test-clients-routes: OK');
