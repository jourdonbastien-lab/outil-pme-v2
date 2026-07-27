'use strict';
const assert = require('assert');
const { createClientsController } = require('./controllers/clientsController');
const calls = [];
const controller = createClientsController({
  clientsService: {
    buildMergedClientList() { calls.push('list'); return [{ name: 'A' }]; },
    createClient(value) { calls.push(['create', value]); },
    deleteClient(id) { calls.push(['delete', id]); }
  },
  renderListView(data) { calls.push(['view', data]); return '<main>liste</main>'; },
  renderClientCard() {},
  pageTemplate(req, title, html) { return `${title}:${html}`; },
  escapeHtml: String,
  clientPageIcon: () => '<svg></svg>',
  safeName: (value) => String(value).replace(/ /g, '_'),
  logRequestBody(value) { calls.push(['log', value]); }
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
  controller.showClients({ query: { error: '<erreur>' }, session: { user: { role: 'atelier' } } }, res);
  assert.strictEqual(res.body, 'Clients:<main>liste</main>');
  const data = calls.find((call) => Array.isArray(call) && call[0] === 'view')[1];
  assert.strictEqual(data.isWorkshop, true);
  assert.strictEqual(data.clientCreateOpen, true);
}
{
  const res = response();
  controller.createClient({ body: {} }, res);
  assert.strictEqual(res.code, 400);
  assert.strictEqual(res.body, 'Nom requis');
}
{
  const res = response();
  controller.createClient({ body: { name: ' A ', city: ' Lyon ' } }, res);
  assert.strictEqual(res.location, '/clients');
  assert.strictEqual(calls.find((call) => Array.isArray(call) && call[0] === 'create')[1].name, 'A');
}
{
  const res = response();
  controller.showClient({ params: { client: 'Client A' } }, res);
  assert.strictEqual(res.location, '/pc-folders/Client_A');
}
{
  const res = response();
  controller.redirectPcFoldersToClients({}, res);
  assert.strictEqual(res.location, '/clients');
  assert.strictEqual(res.code, 200);
}
{
  const res = response();
  controller.deleteClient({ body: { id: '7' } }, res);
  assert.strictEqual(res.location, '/clients');
  assert(calls.some((call) => Array.isArray(call) && call[0] === 'delete' && call[1] === '7'));
}
console.log('test-clients-controller: OK');
