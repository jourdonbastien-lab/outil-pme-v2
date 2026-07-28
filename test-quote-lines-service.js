'use strict';
const assert = require('assert');
const { createQuoteLinesService } = require('./services/quoteLinesService');

function fakeDb({ line, material } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        get(value) {
          calls.push(['get', sql, value]);
          if (/quote_lines/.test(sql)) return line;
          if (/materials/.test(sql)) return material;
        },
        run(...values) {
          calls.push(['run', sql, values]);
          return { lastInsertRowid: 12, changes: 1 };
        }
      };
    }
  };
}
function service(options = {}) {
  const db = options.db || fakeDb(options);
  return {
    db,
    value: createQuoteLinesService({
      db,
      roundAmount: (value) => Math.round(value * 100) / 100,
      calculateSheetWeight: ({ th_mm, w_mm, l_mm, density }) => th_mm * w_mm * l_mm * density / 1000000,
      detectLineCostCategory: () => 'matiere',
      now: () => '2026-07-27T00:00:00.000Z'
    })
  };
}
assert.throws(() => createQuoteLinesService({}), /Base lignes/);
{
  const state = service({ line: { id: 4, quote_id: 2 } });
  assert.deepStrictEqual(state.value.getQuoteLineById(4), { id: 4, quote_id: 2 });
}
{
  const state = service();
  const result = state.value.createQuoteLine({
    quoteId: 2, category: '', label: 'Pose', qty: 2.5, unit: 'h', unitPrice: 80,
    costUnit: 40, costTotal: null, marginPct: 100, coefficient: null,
    hours: null, hourlyCost: null, costCategory: '', costSource: 'saisie de la ligne'
  });
  assert.deepStrictEqual(result, { id: 12, quoteId: 2 });
  const insert = state.db.calls.find((call) => call[0] === 'run');
  assert(/INSERT INTO quote_lines/.test(insert[1]));
  assert.strictEqual(insert[2][6], 200);
  assert.strictEqual(insert[2][11], 2.5);
  assert.strictEqual(insert[2][12], 40);
}
{
  const state = service({ material: { id: 3, type: 'beam', name: 'IPE', unit: 'kg', price: 2, kg_per_m: 10 } });
  state.value.createMaterialQuoteLine({ quoteId: 4, materialId: 3, category: 'Matière', lenM: 2 });
  const insert = state.db.calls.find((call) => call[0] === 'run');
  assert.strictEqual(insert[2][2], 'IPE (2.00 m)');
  assert.strictEqual(insert[2][3], 20);
  assert.strictEqual(insert[2][6], 40);
  assert.strictEqual(insert[2][8], 'matiere');
  assert.strictEqual(insert[2][9], 'répertoire matières');
}
{
  const state = service({ material: null });
  assert.throws(() => state.value.createMaterialQuoteLine({ materialId: 99 }), (error) => error.statusCode === 404 && error.message === 'Matière introuvable');
}
{
  const state = service({ material: { type: 'sheet', name: 'Tôle', price: 3 } });
  assert.throws(() => state.value.createMaterialQuoteLine({ materialId: 1, thMm: 0 }), /Dimensions tôle requises/);
}
{
  const state = service();
  state.value.updateQuoteLine(8, {
    label: 'Tube', qty: 2, unitPrice: 50, costUnit: 20, costTotal: 40, marginPct: 150,
    coefficient: 2.5, hours: null, hourlyCost: null, costCategory: 'matiere'
  });
  const update = state.db.calls.find((call) => call[0] === 'run');
  assert(/UPDATE quote_lines/.test(update[1]));
  assert.strictEqual(update[2][3], 100);
  assert.strictEqual(update[2][11], 'modification de la ligne');
}
{
  const state = service();
  state.value.deleteQuoteLine(7, 3);
  const deletion = state.db.calls.find((call) => call[0] === 'run');
  assert(deletion[1].includes('DELETE FROM quote_lines WHERE id = ? AND quote_id = ?'));
  assert.deepStrictEqual(deletion[2], [7, 3]);
}
console.log('OK - service lignes devis');
