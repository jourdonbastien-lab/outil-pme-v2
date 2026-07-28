'use strict';
const assert = require('assert');
const { createQuoteLinesController } = require('./controllers/quoteLinesController');
const calls = [];
let currentLine = { id: 2, quote_id: 7, qty: 1, unit_price: 10 };
const controller = createQuoteLinesController({
  quoteLinesService: {
    getQuoteLineById() { return currentLine; },
    createQuoteLine(input) { calls.push(['create', input]); },
    createMaterialQuoteLine(input) { calls.push(['material', input]); },
    updateQuoteLine(id, input) { calls.push(['update', id, input]); },
    deleteQuoteLine(id, quoteId) { calls.push(['delete', id, quoteId]); }
  },
  renderQuoteLineEditView: () => 'EDIT',
  pageTemplate: (_req, title, html) => `${title}:${html}`,
  escapeHtml: String,
  clientPageIcon: () => '',
  lineCostCategories: ['matiere', 'main_oeuvre']
});
function response() {
  return { code: 200, body: null, location: null, status(code) { this.code = code; return this; }, send(body) { this.body = body; return this; }, redirect(location) { this.location = location; return this; } };
}
{
  const res = response();
  controller.showQuoteLineEditForm({ params: { id: '2' } }, res);
  assert.strictEqual(res.body, 'Modifier la ligne:EDIT');
}
{
  currentLine = null;
  const res = response();
  controller.showQuoteLineEditForm({ params: { id: '99' } }, res);
  assert.strictEqual(res.code, 404);
  assert.strictEqual(res.body, 'Ligne introuvable');
  currentLine = { id: 2, quote_id: 7 };
}
{
  const res = response();
  controller.createQuoteLine({ body: { quote_id: 7, label: 'Tube', unit: 'm', qty: '2,5', unit_price: 10 } }, res);
  assert.strictEqual(res.code, 400); // Number conserve le comportement historique et refuse la virgule ici
}
{
  const res = response();
  controller.createQuoteLine({ body: { quote_id: 7, label: 'Tube', unit: 'm', qty: 2, unit_price: 10, cost_unit: '3,5' } }, res);
  assert.strictEqual(res.location, '/devis/7');
  assert.strictEqual(calls.find((call) => call[0] === 'create')[1].costUnit, 3.5);
}
{
  const res = response();
  controller.updateQuoteLine({ params: { id: 2 }, body: { qty: 2, unit_price: 0, label: 'Tube', cost_category: 'invalide' } }, res);
  assert.strictEqual(res.code, 400);
  assert.strictEqual(res.body, 'Catégorie de coût invalide');
}
{
  const res = response();
  controller.deleteQuoteLine({ body: { id: 2, quote_id: 7 } }, res);
  assert.strictEqual(res.location, '/devis/7');
}
{
  const res = response();
  controller.createMaterialQuoteLine({ body: { quote_id: 7, material_id: 3, len_m: 2 } }, res);
  assert.strictEqual(res.location, '/devis/7');
}
console.log('OK - contrôleur lignes devis');
