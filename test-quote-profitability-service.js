'use strict';
const assert = require('assert');
const { createQuoteProfitabilityService } = require('./services/quoteProfitabilityService');
const writes = [];
const quote = { id: 7, title: 'Portail', cout_revient: 100 };
const lines = [{ id: 1, quote_id: 7, label: 'Acier', position: 0, cost_total: null, cost_unit: null }];
let saved = { quote_id: 7, manual_adjustments_json: '[{"amount":12}]', material_cost: 5 };
const db = { prepare(sql) { return {
  get: () => sql.includes('FROM quotes') ? quote : saved,
  all: () => lines,
  run: (...args) => { writes.push({ sql, args }); saved = { ...saved, manual_adjustments_json: args[1] }; return { changes: 1 }; }
}; } };
const analyses = [];
const projectProfitability = {
  WORK_CATEGORIES: ['portail'], LINE_COST_CATEGORIES: ['matière acier', 'divers'],
  analyzeQuoteLines: (input) => { analyses.push(input); return { totalHT: 200, totalCost: 100, margin: 100 }; },
  detectWorkCategories: () => ['portail']
};
const service = createQuoteProfitabilityService({ db, projectProfitability, parseOptionalId: Number,
  round2: (v) => Math.round(v * 100) / 100, randomUUID: () => 'uuid', now: () => 'NOW' });
const context = service.getQuoteProfitability(7);
assert.strictEqual(context.historicalCost, 100);
assert.deepStrictEqual(context.detectedCategories, ['portail']);
assert.deepStrictEqual(analyses[0].adjustments, [{ amount: 12 }]);
assert.deepStrictEqual(service.profitabilityPublic(context), {
  quoteId: 7, saved, calculations: context.calculations, historicalCost: 100,
  detectedCategories: ['portail'], availableCategories: ['portail'], lineCostCategories: ['matière acier', 'divers']
});
const result = service.saveQuoteCostForecast(7, { adjustments: [{ amount: '12,345', label: '', type: 'inconnue' }], notes: ' note ' }, 4);
assert.strictEqual(result.quoteId, 7);
assert.deepStrictEqual(JSON.parse(writes[0].args[1]), [{ id: 'uuid', label: 'Ajustement manuel', type: 'divers', amount: 12.35, lineId: null }]);
assert.strictEqual(writes[0].args[2], 'note');
assert.throws(() => service.saveQuoteCostForecast(7, { adjustments: [{ amount: 0 }] }, null), /Montant invalide/);
lines[0].cost_total = 50;
assert.throws(() => service.saveQuoteCostForecast(7, { adjustments: [{ amount: 1, lineId: 1 }] }, null), /doubler le coût/);
console.log('OK - service rentabilité devis');
