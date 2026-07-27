'use strict';
const assert = require('assert');
const fs = require('fs');
const { renderQuoteCreateView } = require('./views/quoteCreateView');
const html = renderQuoteCreateView({
  clients: ['Dupont', 'Société André'],
  quoteDate: '2026-07-27',
  escapeHtml: String,
  clientPageIcon: (name) => `<svg data-icon="${name}"></svg>`
});
assert(html.includes('method="POST" action="/devis"'));
assert(html.includes('<h1>Nouveau devis</h1>'));
for (const name of ['existing_client', 'title', 'quote_date', 'status', 'prospect_name', 'prospect_email', 'prospect_phone', 'prospect_address']) {
  assert(html.includes(`name="${name}"`), name);
}
assert(html.includes('value="2026-07-27"'));
assert(html.includes('<option>Brouillon</option>'));
assert(html.includes('Créer le devis'));
assert(html.includes('href="/devis">Annuler</a>'));
assert(html.includes("existing.addEventListener('change', sync)"));
assert(html.indexOf('Dupont') < html.indexOf('Société André'));
const source = fs.readFileSync('views/quoteCreateView.js', 'utf8');
assert(!/SELECT |INSERT INTO|fs\\.|req\\.|res\\./.test(source));
console.log('OK - vue création devis');
