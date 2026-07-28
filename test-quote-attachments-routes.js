'use strict';
const assert = require('assert');
const fs = require('fs');
const routesModule = require('./routes/quoteAttachments');
const routes = [];
const app = { get(path, ...handlers) { routes.push(['GET', path, ...handlers]); }, post(path, ...handlers) { routes.push(['POST', path, ...handlers]); } };
const requireLogin = () => {};
const handlers = { upload() {}, delete() {}, serve() {} };
routesModule.registerQuoteAttachmentUploadRoute(app, { requireLogin, handlers });
routesModule.registerQuoteAttachmentDeleteRoute(app, { requireLogin, handlers });
routesModule.registerQuoteAttachmentFileRoute(app, { requireLogin, handlers });
assert.deepStrictEqual(routes.map((route) => route.slice(0, 2)), [
  ['POST', '/devis/:id/photo'],
  ['POST', '/devis/:id/photo/delete'],
  ['GET', '/quote-photos/:id/:file']
]);
assert(routes.every((route) => route[2] === requireLogin));
const source = fs.readFileSync('routes/quoteAttachments.js', 'utf8');
assert(!/fs\\.|SELECT |INSERT |UPDATE |DELETE FROM|<form/.test(source));
console.log('OK - routes pièces jointes devis');
