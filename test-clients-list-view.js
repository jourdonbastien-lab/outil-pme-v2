'use strict';
const assert = require('assert');
const fs = require('fs');
const { renderClientsListView } = require('./views/clientsListView');
const render = (overrides = {}) => renderClientsListView({
  clients: [], clientCreateError: '', clientCreateOpen: false,
  escapeHtml: (value) => String(value).replace(/</g, '&lt;'),
  clientPageIcon: (name) => `<svg data-icon="${name}"></svg>`,
  renderClientCard: (client) => `<article>${client.name}</article>`,
  ...overrides
});
const empty = render();
assert(empty.includes('<h1>Nouveau client</h1>'));
assert(empty.includes('method="POST" action="/clients"'));
for (const name of ['name', 'email', 'address', 'postal_code', 'city', 'phone']) assert(empty.includes(`name="${name}"`));
assert(empty.includes('Aucun client'));
assert(empty.includes('id="clientSearch"'));
assert(empty.includes("querySelectorAll('.client-card-modern')"));
const populated = render({ clients: [{ name: 'A' }, { name: 'B' }] });
assert(populated.includes('2 au total'));
assert(populated.indexOf('<article>A</article>') < populated.indexOf('<article>B</article>'));
const errored = render({ clientCreateError: '<danger>', clientCreateOpen: true });
assert(errored.includes('&lt;danger>'));
assert(errored.includes('aria-expanded="true"'));
const source = fs.readFileSync(require.resolve('./views/clientsListView'), 'utf8');
assert(!source.includes("require('fs')"));
assert(!source.includes("require('path')"));
assert(!source.includes("require('express')"));
assert(!source.includes("require('better-sqlite3')"));
console.log('test-clients-list-view: OK');
