'use strict';
const assert = require('assert');
const { createQuoteDetailController } = require('./controllers/quoteDetailController');
let found = true; const calls = [];
const controller = createQuoteDetailController({
  quoteDetailService: { getQuoteDetail: (id) => found ? { id } : null },
  renderQuoteDetailView: (data, deps) => { calls.push(['view', data, deps]); return '<main>fiche</main>'; },
  pageTemplate: (req, title, html) => { calls.push(['page', req, title, html]); return `<page>${html}</page>`; },
  viewDependencies: { marker: true }
});
function response() { return { code: 200, body: null, status(code) { this.code = code; return this; }, send(body) { this.body = body; return this; } }; }
const req = { params: { id: '7' } }; let res = response();
controller.showQuoteDetail(req, res);
assert.strictEqual(res.body, '<page><main>fiche</main></page>');
assert.deepStrictEqual(calls[1], ['page', req, 'Devis #7', '<main>fiche</main>']);
found = false; res = response(); controller.showQuoteDetail({ params: { id: 'x' } }, res);
assert.deepStrictEqual([res.code, res.body], [404, 'Devis introuvable']);
console.log('OK - contrôleur détail devis');
