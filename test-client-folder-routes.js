'use strict';
const assert = require('assert');
const fs = require('fs');
const { registerClientFolderRoutes } = require('./routes/clientFolders');
assert.strictEqual(typeof registerClientFolderRoutes, 'function');
const calls = [];
const app = {
  get: (...args) => calls.push(['GET', ...args]),
  post: (...args) => calls.push(['POST', ...args])
};
const requireLogin = () => {};
const uploadSingleFile = () => {};
const handlers = {
  showClientFolders() {},
  showClientOrderRootFolder() {},
  showClientOrderFolder() {},
  uploadClientOrderFolderFile() {}
};
registerClientFolderRoutes(app, { requireLogin, uploadSingleFile, handlers });
assert.deepStrictEqual(calls.map((call) => call.slice(0, 2)), [
  ['GET', '/pc-folders/:client'],
  ['GET', '/pc-folders/:client/:order'],
  ['GET', '/pc-folders/:client/:order/:type'],
  ['POST', '/pc-folders/:client/:order/:type/upload']
]);
assert(calls.every((call) => call[2] === requireLogin));
assert.strictEqual(calls[0][3], handlers.showClientFolders);
assert.strictEqual(calls[1][3], handlers.showClientOrderRootFolder);
assert.strictEqual(calls[2][3], handlers.showClientOrderFolder);
assert.strictEqual(calls[3][3], uploadSingleFile);
assert.strictEqual(calls[3][4], handlers.uploadClientOrderFolderFile);
assert.strictEqual(new Set(calls.map((call) => `${call[0]} ${call[1]}`)).size, 4);
const source = fs.readFileSync('routes/clientFolders.js', 'utf8');
assert(!/SELECT|INSERT|UPDATE|DELETE|<article|fs\./.test(source));
console.log('OK - routes navigation dossiers clients');
