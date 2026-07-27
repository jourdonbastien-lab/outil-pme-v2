'use strict';

const assert = require('assert');
const fs = require('fs');
const { registerPcFoldersAliasRoute } = require('./routes/clients');
const { registerClientFolderRoutes } = require('./routes/clientFolders');

const routes = [];
const app = {
  get(path, ...handlers) { routes.push(['GET', path, ...handlers]); },
  post(path, ...handlers) { routes.push(['POST', path, ...handlers]); }
};
const requireLogin = () => {};
const redirectPcFoldersToClients = () => {};
const uploadSingleFile = () => {};
const handlers = {
  showClientFolders() {},
  showClientOrderRootFolder() {},
  showClientOrderFolder() {},
  uploadClientOrderFolderFile() {}
};

registerPcFoldersAliasRoute(app, { requireLogin, redirectPcFoldersToClients });
registerClientFolderRoutes(app, { requireLogin, uploadSingleFile, handlers });

assert.deepStrictEqual(routes.map(([method, path]) => [method, path]), [
  ['GET', '/pc-folders'],
  ['GET', '/pc-folders/:client'],
  ['GET', '/pc-folders/:client/:order'],
  ['GET', '/pc-folders/:client/:order/:type'],
  ['POST', '/pc-folders/:client/:order/:type/upload']
]);
assert.strictEqual(new Set(routes.map(([method, path]) => `${method} ${path}`)).size, routes.length);
assert(routes.every((route) => route[2] === requireLogin));

const serverSource = fs.readFileSync('server.js', 'utf8');
assert(!/app\.(?:get|post)\('\/pc-folders/.test(serverSource));
console.log('OK - ordre et unicité des routes pc-folders');
