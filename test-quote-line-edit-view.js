'use strict';
const assert = require('assert');
const fs = require('fs');
const { renderQuoteLineEditView } = require('./views/quoteLineEditView');
const html = renderQuoteLineEditView({
  line: {
    id: 3, quote_id: 8, label: '<Tube>', qty: 2, unit: 'm', unit_price: 50,
    cost_unit: 20, cost_total: 40, margin_pct: 150, coefficient: 2.5,
    hours: null, hourly_cost: null, cost_category: 'matiere'
  },
  escapeHtml: (value) => String(value).replace(/</g, '&lt;'),
  clientPageIcon: (name) => `<svg data-icon="${name}"></svg>`,
  lineCostCategories: ['matiere', 'main_oeuvre']
});
assert(html.includes('<h1>Modifier la ligne</h1>'));
assert(html.includes('method="POST" action="/devis/line/3/edit"'));
for (const name of ['label', 'cost_category', 'qty', 'unit', 'cost_unit', 'cost_total', 'margin_pct', 'coefficient', 'unit_price', 'hours', 'hourly_cost']) {
  assert(html.includes(`name="${name}"`), name);
}
assert(html.includes('&lt;Tube>'));
assert(html.includes('data-line-summary-cost'));
assert(html.includes("save.textContent='Enregistrement…'"));
const source = fs.readFileSync('views/quoteLineEditView.js', 'utf8');
assert(!/SELECT |INSERT |UPDATE |DELETE |fs\\.|req\\.|res\\./.test(source));
console.log('OK - vue édition ligne devis');
