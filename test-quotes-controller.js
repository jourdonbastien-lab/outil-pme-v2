'use strict';
const assert = require('assert');
const fs = require('fs');
const { createQuotesController } = require('./controllers/quotesController');
const calls = [];
const controller = createQuotesController({
  quotesService: {
    listQuotes() { calls.push('list'); return [{ id: 1 }]; },
    getQuoteCreationData() { calls.push('creationData'); return { clients: ['Dupont'] }; },
    createQuote(input) { calls.push(['create', input]); return 9; }
  },
  renderQuotesListView(data) { calls.push(['listView', data]); return 'LIST'; },
  renderQuoteCreateView(data) { calls.push(['createView', data]); return 'FORM'; },
  pageTemplate(req, title, html) { return `${title}:${html}`; },
  isoDate: () => '2026-07-27',
  escapeHtml: String,
  quoteStatusClass: String,
  clientPageIcon: () => '',
  infoBar: () => ''
});
function response() {
  return {
    code: 200, body: null, location: null,
    status(code) { this.code = code; return this; },
    send(body) { this.body = body; return this; },
    redirect(location) { this.location = location; return this; }
  };
}
{
  const res = response();
  controller.showQuotesList({}, res);
  assert.strictEqual(res.body, 'Devis:LIST');
  assert(calls.includes('list'));
}
{
  const res = response();
  controller.showQuoteCreateForm({}, res);
  assert.strictEqual(res.body, 'Nouveau devis:FORM');
  const data = calls.find((call) => Array.isArray(call) && call[0] === 'createView')[1];
  assert.strictEqual(data.quoteDate, '2026-07-27');
}
{
  const res = response();
  controller.createQuote({ body: {} }, res);
  assert.strictEqual(res.code, 400);
  assert.strictEqual(res.body, '❌ Titre du devis requis');
}
{
  const res = response();
  controller.createQuote({ body: { title: 'Portail' } }, res);
  assert.strictEqual(res.code, 400);
  assert.strictEqual(res.body, '❌ Nom du prospect requis');
}
{
  const res = response();
  controller.createQuote({ body: { title: ' Portail ', existing_client: ' Dupont ', quote_date: '' } }, res);
  assert.strictEqual(res.location, '/devis/9');
  const input = calls.find((call) => Array.isArray(call) && call[0] === 'create')[1];
  assert.strictEqual(input.title, 'Portail');
  assert.strictEqual(input.clientName, 'Dupont');
  assert.strictEqual(input.quoteDate, '2026-07-27');
}
{
  const res = response();
  controller.createQuote({ body: {
    title: 'Portillon', prospect_name: ' Prospect ', prospect_email: ' p@example.fr ',
    prospect_phone: ' 06 ', prospect_address: ' Rue '
  } }, res);
  assert.strictEqual(res.location, '/devis/9');
}
const source = fs.readFileSync('controllers/quotesController.js', 'utf8');
assert(!/SELECT |INSERT INTO|UPDATE |DELETE FROM/.test(source));
console.log('OK - contrôleur liste et création devis');
