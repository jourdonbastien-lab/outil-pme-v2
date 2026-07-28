'use strict';
const assert = require('assert');
const { createQuoteSettingsController } = require('./controllers/quoteSettingsController');
const calls = [];
let found = true;
const controller = createQuoteSettingsController({
  quoteSettingsService: {
    updateQuoteNotes(...args) { calls.push(['notes', ...args]); },
    updateQuoteStatus(...args) { calls.push(['status', ...args]); },
    updateQuoteVat(...args) { calls.push(['vat', ...args]); },
    updateQuoteMargin(...args) { calls.push(['margin', ...args]); },
    findQuoteById() { return found ? { id: 2 } : null; },
    deleteQuote(id) { calls.push(['delete', id]); }
  },
  normalizeQuoteStatus: (value) => ['Brouillon', 'Envoyé'].includes(value) ? value : 'Brouillon'
});
function response() {
  return { code: 200, body: null, location: null, status(code) { this.code = code; return this; }, send(body) { this.body = body; return this; }, redirect(location) { this.location = location; return this; } };
}
let res = response();
controller.updateQuoteNotes({ params: { id: '2' }, body: {} }, res);
assert.deepStrictEqual(calls[0], ['notes', '2', '']);
res = response();
controller.updateQuoteStatus({ params: { id: '2' }, body: { status: 'invalide' } }, res);
assert.deepStrictEqual(calls[1], ['status', 2, 'Brouillon']);
res = response();
controller.updateQuoteVat({ params: { id: '2' }, body: { vat_rate: 5 } }, res);
assert.strictEqual(res.code, 400);
assert.strictEqual(res.body, 'TVA invalide');
res = response();
controller.updateQuoteMargin({ params: { id: '2' }, body: { margin_pct: -1 } }, res);
assert.strictEqual(res.body, 'Marge invalide');
found = false;
res = response();
controller.deleteQuote({ params: { id: '2' } }, res);
assert.strictEqual(res.code, 404);
assert.strictEqual(res.body, 'Devis introuvable');
found = true;
res = response();
controller.deleteQuote({ params: { id: '2' } }, res);
assert.strictEqual(res.location, '/devis');
console.log('OK - contrôleur paramètres devis');
