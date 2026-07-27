'use strict';
const assert = require('assert');
const { renderClientCard } = require('./views/clientCardView');
const context = {
  escapeHtml: (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;'),
  clientPageIcon: (name, className = '') => `<svg data-icon="${name}" class="${className}"></svg>`
};
const dbCard = renderClientCard({ id: 3, name: '<Dupont>', folder: 'Dupont', source: 'db', city: 'Lyon', phone: '06', email: 'a@b.fr' }, context);
assert(dbCard.includes('&lt;Dupont>'));
assert(dbCard.includes('href="/pc-folders/Dupont"'));
assert(dbCard.includes('action="/clients/delete"'));
assert(dbCard.includes("confirm('Supprimer définitivement ce client ?')"));
assert(dbCard.includes('data-icon="database"'));
const pcCard = renderClientCard({ name: 'Société André', folder: 'Société André', source: 'pc' }, context);
assert(pcCard.includes('/pc-folders/Soci%C3%A9t%C3%A9%20Andr%C3%A9'));
assert(pcCard.includes('data-icon="folder"'));
assert(!pcCard.includes('/clients/delete'));
console.log('test-client-card-view: OK');
