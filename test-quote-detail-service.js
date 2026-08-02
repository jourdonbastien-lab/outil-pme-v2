'use strict';
const assert = require('assert');
const { createQuoteDetailService } = require('./services/quoteDetailService');

const quote = { id: 7, title: 'Portail', status: 'Accepté', vat_rate: 20, margin_pct: 10 };
const lines = [
  { id: 2, quote_id: 7, position: 0, total: 100, cost_total: null, hours: 2 },
  { id: 3, quote_id: 7, position: 1, total: 50, cost_total: 20, hours: null }
];
const materials = [{ id: 1, name: 'Acier', type: null }];
const measurements = [{ id: 9, quote_id: 7 }];
const queries = [];
let quoteFound = true;
const db = { prepare(sql) { queries.push(sql); return {
  get: () => quoteFound ? quote : undefined,
  all: () => sql.includes('materials') ? materials : sql.includes('quote_lines') ? lines : measurements
}; } };
const logs = [];
const profitability = { saved: { notes: 'x' }, calculations: { totalHT: 150 } };
const service = createQuoteDetailService({
  db,
  quoteAttachmentsService: { listQuoteAttachments: () => ['b été.pdf', 'a.jpg'] },
  quoteSketchesService: { getQuoteSketch: () => '/tmp/7.png' },
  quoteProfitabilityService: { getQuoteProfitability: () => profitability },
  round2: (value) => Math.round(value * 100) / 100,
  normalizeVatRate: Number,
  normalizeQuoteStatus: (value) => value,
  quotePhotoDirectory: (id) => `/photos/${id}`,
  fileExists: () => true,
  log: (...args) => logs.push(args)
});
const detail = service.getQuoteDetail(7);
assert.strictEqual(detail.quote, quote);
assert.strictEqual(detail.lines, lines);
assert.deepStrictEqual(detail.materials, [{ id: 1, name: 'Acier', type: null, type_safe: '' }]);
assert.strictEqual(detail.total, 150);
assert.strictEqual(detail.totalWithMargin, 165);
assert.strictEqual(detail.tva, 30);
assert.strictEqual(detail.totalTtc, 180);
assert.strictEqual(detail.acceptDisabled, true);
assert.strictEqual(detail.profitabilityContext, profitability);
assert.deepStrictEqual(detail.sketch, { exists: true, path: '/tmp/7.png', url: '/sketches/quotes/7.png' });
assert.deepStrictEqual(logs[0], ['LECTURE FICHIERS DEVIS', { id: 7, photoDir: '/photos/7', exists: true }]);
assert(queries.some((sql) => sql.includes('ORDER BY position ASC, id ASC')));
assert(queries.some((sql) => sql.includes('ORDER BY updated_at DESC, id DESC')));
quoteFound = false;
assert.strictEqual(service.getQuoteDetail(999), null);
console.log('OK - service détail devis');
