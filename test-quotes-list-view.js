'use strict';
const assert = require('assert');
const fs = require('fs');
const { renderQuotesListView } = require('./views/quotesListView');
const dependencies = {
  escapeHtml: (value) => String(value).replace(/</g, '&lt;'),
  quoteStatusClass: (status) => `status-${status}`,
  clientPageIcon: (name, className) => `<svg data-icon="${name}" class="${className}"></svg>`,
  infoBar: (left, right) => `<aside>${left}${right}</aside>`
};
const empty = renderQuotesListView({ quotes: [], ...dependencies });
assert(empty.includes('<h1>Devis</h1>'));
assert(empty.includes('href="/devis/new"'));
assert(empty.includes('Aucun devis'));
assert(empty.includes('0 devis au total'));
const html = renderQuotesListView({
  quotes: [{
    id: 7, displayTitle: '<Portail>', displayClientName: 'Dupont', normalizedStatus: 'Brouillon',
    displayDate: '27/07/2026', totalHt: 100, totalTtc: 120
  }],
  ...dependencies
});
assert(html.includes('class="quote-list-card"'));
assert(html.includes('href="/devis/7"'));
assert(html.includes('&lt;Portail>'));
assert(html.includes('HT : 100.00 €'));
assert(html.includes('120.00 € TTC'));
assert(html.includes('status-Brouillon'));
const source = fs.readFileSync('views/quotesListView.js', 'utf8');
for (const dependency of ['fs', 'path', 'express', 'better-sqlite3']) {
  assert(!source.includes(`require('${dependency}')`));
}
console.log('OK - vue liste devis');
