'use strict';
const assert = require('assert');
const { renderWorksitesListView } = require('./views/worksitesListView');
const empty = renderWorksitesListView({ clients: [], worksites: [] }, { escHtml: String, chantierStatusOptions: () => '<option>À préparer</option>', renderWorksiteCard: () => '', cardDependencies: {} });
for (const token of ['<h1>Chantiers</h1>', 'Aucun chantier pour le moment.', 'method="POST" action="/chantiers"', 'name="name"', 'name="client_id"', 'name="status"', 'name="planned_hours"', 'name="start_date"', 'name="end_date"', 'name="description"']) assert(empty.includes(token), token);
const filled = renderWorksitesListView({ clients: [{ id: 3, name: '<Client>' }], worksites: [{ id: 1 }] }, { escHtml: (v) => String(v).replaceAll('<', '&lt;').replaceAll('>', '&gt;'), chantierStatusOptions: () => '', renderWorksiteCard: () => '<article>CARTE</article>', cardDependencies: {} });
assert(filled.includes('&lt;Client&gt;')); assert(filled.includes('CARTE'));
console.log('OK - vue liste chantiers');
