'use strict';

const assert = require('assert');
const fs = require('fs');
const { registerPcFilesRoutes } = require('./routes/pcFiles');
const { registerClientFolderRoutes } = require('./routes/clientFolders');

const calls = [];
const app = {
  get(path, ...handlers) { calls.push(['GET', path, ...handlers]); },
  post(path, ...handlers) { calls.push(['POST', path, ...handlers]); }
};
const requireLogin = () => {};
const uploadSingleFile = () => {};
const pcHandlers = { showFilePreview() {}, serveRawFile() {}, uploadFile() {} };
const folderHandlers = {
  showClientFolders() {}, showClientOrderRootFolder() {}, showClientOrderFolder() {},
  uploadClientOrderFolderFile: pcHandlers.uploadFile
};
registerClientFolderRoutes(app, { requireLogin, uploadSingleFile, handlers: folderHandlers });
registerPcFilesRoutes(app, { requireLogin, handlers: pcHandlers });
assert.deepStrictEqual(calls.map((call) => call.slice(0, 2)), [
  ['GET', '/pc-folders/:client'],
  ['GET', '/pc-folders/:client/:order'],
  ['GET', '/pc-folders/:client/:order/:type'],
  ['POST', '/pc-folders/:client/:order/:type/upload'],
  ['GET', '/pc-file/:client/:order/:type/:file'],
  ['GET', '/pc-file-raw/:client/:order/:type/:file']
]);
assert(calls.every((call) => call[2] === requireLogin));
assert.strictEqual(calls[3][3], uploadSingleFile);
assert.strictEqual(calls[3][4], pcHandlers.uploadFile);
assert.strictEqual(new Set(calls.map((call) => `${call[0]} ${call[1]}`)).size, calls.length);
assert(!/SELECT|INSERT|UPDATE|DELETE|<html|fs\.|path\./.test(fs.readFileSync('routes/pcFiles.js', 'utf8')));
console.log('OK - routes fichiers PC');
