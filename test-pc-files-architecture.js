'use strict';

const assert = require('assert');
const fs = require('fs');

const read = (file) => fs.readFileSync(file, 'utf8');
const server = read('server.js');
const route = read('routes/pcFiles.js');
const service = read('services/pcFilesService.js');
const view = read('views/pcFilePreviewView.js');
const clientRoutes = read('routes/clientFolders.js');
for (const source of [route, service, view]) assert(!/require\(['"]\.\.\/server/.test(source));
assert(!/app\.get\(['"]\/pc-file/.test(server));
assert.strictEqual((route.match(/\/pc-file\/:client\/:order\/:type\/:file/g) || []).length, 1);
assert.strictEqual((route.match(/\/pc-file-raw\/:client\/:order\/:type\/:file/g) || []).length, 1);
assert.strictEqual((clientRoutes.match(/\/pc-folders\/:client\/:order\/:type\/upload/g) || []).length, 1);
assert(!/\breq\.|\bres\./.test(service));
assert(!/\breq\.|\bres\.|require\(['"](?:fs|path)['"]\)|\bfs\.|\bpath\./.test(view));
assert(!/SELECT|INSERT|UPDATE|DELETE/.test(route + view));
assert(!/function safeResolveInside|function safeName|function safeSegment/.test(service));
for (const protectedPath of [
  './routes/quoteAttachments', './controllers/clientOrderInvoicesController',
  './controllers/measurementPhotosController', './routes/quoteSketches'
]) assert(server.includes(protectedPath));
console.log('OK - architecture fichiers PC');
