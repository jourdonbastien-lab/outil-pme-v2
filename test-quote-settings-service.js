'use strict';
const assert = require('assert');
const { createQuoteSettingsService } = require('./services/quoteSettingsService');
const calls = [];
const db = {
  prepare(sql) {
    return {
      get(id) { calls.push(['get', sql, id]); return id === 4 ? { id } : undefined; },
      run(...values) { calls.push(['run', sql, values]); return { changes: 1 }; }
    };
  }
};
const removed = [];
const service = createQuoteSettingsService({
  db,
  removeQuotePhotos: (id) => removed.push(['photos', id]),
  removeQuoteSketch: (id) => removed.push(['sketch', id])
});
service.updateQuoteNotes(4, '');
service.updateQuoteStatus(4, 'Envoyé');
service.updateQuoteVat(4, 10);
service.updateQuoteMargin(4, 22.5);
assert(calls.some((call) => /SET notes/.test(call[1]) && call[2][0] === ''));
assert(calls.some((call) => /SET status/.test(call[1]) && call[2][0] === 'Envoyé'));
assert.deepStrictEqual(service.findQuoteById(4), { id: 4 });
service.deleteQuote(4);
const deletes = calls.filter((call) => call[0] === 'run' && /DELETE FROM/.test(call[1]));
assert(/DELETE FROM quote_lines/.test(deletes[0][1]));
assert(/DELETE FROM quotes/.test(deletes[1][1]));
assert.deepStrictEqual(removed, [['photos', 4], ['sketch', 4]]);
console.log('OK - service paramètres devis');
