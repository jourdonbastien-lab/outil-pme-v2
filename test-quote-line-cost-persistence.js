'use strict';

const assert = require('assert');
const fs = require('fs');
const Database = require('better-sqlite3');
const profitability = require('./lib/projectProfitability');

const server = fs.readFileSync('server.js', 'utf8');
const quoteDetailView = fs.readFileSync('views/quoteDetailView.js', 'utf8');
for (const name of ['cost_unit', 'margin_pct']) {
  assert((server + quoteDetailView).includes(`name="${name}"`), `attribut HTML name absent: ${name}`);
}
for (const column of ['cost_unit', 'cost_total', 'margin_pct', 'coefficient', 'hours', 'hourly_cost']) {
  assert(server.includes(`ensureColumn('quote_lines', '${column}'`), `migration absente: ${column}`);
}

const db = new Database(':memory:');
db.exec(`CREATE TABLE quote_lines (
  id INTEGER PRIMARY KEY, quote_id INTEGER, qty REAL, unit TEXT, unit_price REAL, total REAL,
  cost_unit REAL, cost_total REAL, margin_pct REAL, coefficient REAL, hours REAL, hourly_cost REAL
)`);
const insert = db.prepare(`INSERT INTO quote_lines
  (quote_id, qty, unit, unit_price, total, cost_unit, cost_total, margin_pct, coefficient, hours, hourly_cost)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
insert.run(1, 2, 'u', 270, 540, 180, null, 50, null, null, null);
insert.run(1, 1, 'u', 100, 100, null, null, null, null, null, null);

let saved = db.prepare('SELECT * FROM quote_lines WHERE quote_id = 1 ORDER BY id').all();
assert.strictEqual(saved[0].cost_unit, 180);
assert.strictEqual(saved[0].margin_pct, 50);
assert.strictEqual(saved[0].qty, 2);
assert.strictEqual(saved[0].total, 540);
assert.strictEqual(saved[1].cost_unit, null);
assert.strictEqual(saved[1].margin_pct, null);
const initialAnalysis = profitability.analyzeQuoteLines({ lines: [saved[0]] });
assert.strictEqual(initialAnalysis.lines[0].detectedCost, 360);
assert.strictEqual(initialAnalysis.lines[0].margin, 180);
assert.strictEqual(initialAnalysis.lines[0].costSource, 'quantity_times_purchase_unit');

db.prepare('UPDATE quote_lines SET margin_pct = ?, unit_price = ?, total = ? WHERE id = ?').run(60, 288, 576, saved[0].id);
saved = db.prepare('SELECT * FROM quote_lines WHERE id = ?').get(saved[0].id);
assert.strictEqual(saved.margin_pct, 60);
assert.strictEqual(saved.cost_unit, 180);

db.prepare(`INSERT INTO quote_lines
  (quote_id, qty, unit, unit_price, total, cost_unit, cost_total, margin_pct, coefficient, hours, hourly_cost)
  SELECT 2, qty, unit, unit_price, total, cost_unit, cost_total, margin_pct, coefficient, hours, hourly_cost
  FROM quote_lines WHERE quote_id = 1`).run();
const copied = db.prepare('SELECT * FROM quote_lines WHERE quote_id = 2 ORDER BY id').all();
assert.strictEqual(copied[0].cost_unit, 180);
assert.strictEqual(copied[0].margin_pct, 60);
assert.strictEqual(copied[1].cost_unit, null);

const analysis = profitability.analyzeQuoteLines({ lines: copied });
assert.strictEqual(analysis.lines[0].detectedCost, 360);
assert.strictEqual(analysis.lines[0].margin, 216);
assert.strictEqual(analysis.lines[0].costSource, 'quantity_times_purchase_unit');

console.log('OK - persistance des coûts de lignes de devis');
