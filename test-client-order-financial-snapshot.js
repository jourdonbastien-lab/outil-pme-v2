'use strict';

const assert = require('assert');
const Database = require('better-sqlite3');
const financial = require('./lib/clientOrderFinancialSnapshot');
const costs = require('./lib/clientOrderCostLines');

function snapshot(input = {}) {
  return financial.buildClientOrderFinancialSnapshot({ order: { id: 1, price: 0, ...input.order }, ...input });
}

assert.strictEqual(financial.normalizeNumber(null), 0);
assert.strictEqual(financial.normalizeNumber('12,50'), 12.5);
assert.strictEqual(financial.normalizeNumber('invalide'), 0);
assert.strictEqual(financial.roundAmount(1.005), 1.01);
assert.deepStrictEqual(financial.calculateMargin(0, 20), { amount: -20, rate: 0 });
assert.strictEqual(financial.calculateRemainingToInvoice(100, 120), 0);
assert.strictEqual(financial.calculateRemainingHours(8, 10), 0);

let result = snapshot();
assert.deepStrictEqual(result.budget, { material: 0, labor: 0, subcontracting: 0, other: 0, total: 0 });
assert.strictEqual(result.revenue.invoicedExVat, 0);

result = snapshot({ order: { price: '1000' } });
assert.strictEqual(result.margin.forecastAmount, 1000);
assert.strictEqual(result.margin.forecastRate, 100);

const materialLine = { line_type: 'material', quantity: 2, unit_cost_ht: 100 };
result = snapshot({ order: { price: 1000 }, budgetLines: [materialLine] });
assert.strictEqual(result.budget.material, 200);

const laborLine = { line_type: 'labor', planned_minutes: 600, hourly_cost_ht: 40 };
result = snapshot({ order: { price: 1000 }, budgetLines: [laborLine], hours: [{ minutes_total: 120 }] });
assert.strictEqual(result.budget.labor, 400);
assert.strictEqual(result.actual.labor, 80);

result = snapshot({
  order: { price: 2000 },
  budgetLines: [materialLine, laborLine,
    { line_type: 'other', category: 'Sous-traitance', quantity: 1, unit_cost_ht: 300 },
    { line_type: 'other', category: 'Transport', quantity: 1, unit_cost_ht: 50 }]
});
assert.deepStrictEqual(result.budget, { material: 200, labor: 400, subcontracting: 300, other: 50, total: 950 });

result = snapshot({ order: { price: 1000 }, invoices: [{ id: 1, amount_ht: 400 }] });
assert.strictEqual(result.revenue.remainingToInvoiceExVat, 600);
result = snapshot({ order: { price: 1000 }, invoices: [{ id: 1, amount_ht: 1000 }] });
assert.strictEqual(result.revenue.remainingToInvoiceExVat, 0);
result = snapshot({ order: { price: 1000 }, invoices: [{ id: 1, amount_ht: 1200 }] });
assert.strictEqual(result.warnings.length, 1);

result = snapshot({ order: { price: 100 }, budgetLines: [{ ...materialLine, unit_cost_ht: 80 }] });
assert.strictEqual(result.margin.forecastAmount, -60);
result = snapshot({ order: { price: 100 }, invoices: [{ id: 1, amount_ht: 50 }], actualCosts: [{ cost_type: 'material', amount_ht: 80 }] });
assert.strictEqual(result.margin.actualAmount, -30);

result = snapshot({ order: { price: null }, invoices: [{ id: 1, amount_ht: null }] });
assert.strictEqual(result.revenue.expectedExVat, 0);
assert.strictEqual(result.revenue.invoicedExVat, 0);
result = snapshot({ order: { price: '123.45' }, invoices: [{ id: 1, amount_ht: '23.45' }] });
assert.strictEqual(result.revenue.remainingToInvoiceExVat, 100);

const legacyForecast = { snapshot_json: JSON.stringify({
  breakdown: { material: 200, subcontracting: 100, transport: 50 },
  laborCost: 300, forecastCost: 650, hourlyCost: 60, hours: { total: 5 }
}) };
result = snapshot({ order: { price: 1000, planned_hours: 9 }, legacyForecast });
assert.deepStrictEqual(result.budget, { material: 200, labor: 300, subcontracting: 100, other: 50, total: 650 });
assert.strictEqual(result.hours.budgeted, 5);
assert.strictEqual(result.sources.budget, 'project_profitability_forecasts');

result = snapshot({ budgetLines: [laborLine], hours: [{ minutes_total: 300 }] });
assert.strictEqual(result.hours.remaining, 5);
result = snapshot({ budgetLines: [laborLine], hours: [{ minutes_total: 900 }] });
assert.strictEqual(result.hours.remaining, 0);

result = snapshot({ order: { price: 10.01 }, budgetLines: [{ line_type: 'material', quantity: 3, unit_cost_ht: 1.005 }] });
assert.strictEqual(result.budget.total, 3.01);
assert.strictEqual(result.margin.forecastAmount, 7);

result = snapshot({ budgetLines: [{ ...materialLine, id: 1 }, { ...materialLine, id: 2 }] });
assert.strictEqual(result.budget.material, 400, 'chaque ligne de budget ne doit être comptée qu’une fois');
result = snapshot({ budgetLines: [materialLine], legacyForecast });
assert.strictEqual(result.budget.total, 200, 'le fallback historique ne doit pas être ajouté aux lignes modernes');
assert.strictEqual(result.budget.total, costs.summarize([materialLine]).totalCost, 'cohérence avec l’ancienne synthèse compatible');

result = snapshot({
  invoices: [{ id: 1, amount_ht: 500 }],
  actualCosts: [
    { cost_type: 'material', amount_ht: 100 },
    { cost_type: 'subcontracting', amount_ht: 80 },
    { cost_type: 'transport', amount_ht: 20 }
  ]
});
assert.deepStrictEqual(result.actual, { material: 100, labor: 0, subcontracting: 80, other: 20, total: 200 });

result = snapshot({
  order: { price: 500 }, invoices: [{ id: 1, amount_ht: 100 }, { id: 1, amount_ht: 100 }]
});
assert.strictEqual(result.revenue.invoicedExVat, 100, 'une facture identifiée ne doit pas être comptée deux fois');

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE client_orders (id INTEGER PRIMARY KEY, name TEXT, description TEXT, price REAL, planned_hours REAL);
  CREATE TABLE client_order_cost_lines (id INTEGER PRIMARY KEY, client_order_id INTEGER, line_type TEXT, category TEXT, designation TEXT, quantity REAL, unit_cost_ht REAL, planned_minutes INTEGER, hourly_cost_ht REAL, sort_order INTEGER);
  CREATE TABLE client_order_invoices (id INTEGER PRIMARY KEY, client_order_id INTEGER, amount_ht REAL);
  CREATE TABLE chantier_hours (id INTEGER PRIMARY KEY, client_order_id INTEGER, client TEXT, order_name TEXT, minutes_total INTEGER);
  CREATE TABLE project_actual_costs (id INTEGER PRIMARY KEY, client_order_id INTEGER, cost_type TEXT, amount_ht REAL);
  CREATE TABLE project_profitability_forecasts (id INTEGER PRIMARY KEY, client_order_id INTEGER, snapshot_json TEXT, created_at TEXT);
`);
db.prepare('INSERT INTO client_orders VALUES (?, ?, ?, ?, ?)').run(7, 'Client', 'Portail', 1000, 8);
db.prepare('INSERT INTO client_order_cost_lines VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(1, 7, 'material', 'Acier', 'Tube', 2, 100, 0, 0, 0);
db.prepare('INSERT INTO client_order_invoices VALUES (?, ?, ?)').run(1, 7, 400);
const databaseSnapshot = financial.getClientOrderFinancialSnapshot(db, 7);
assert.strictEqual(databaseSnapshot.revenue.remainingToInvoiceExVat, 600);
assert.strictEqual(databaseSnapshot.budget.material, 200);
assert.strictEqual(financial.getClientOrderFinancialSnapshot(db, 99), null);
db.close();

console.log('OK - snapshot financier central des commandes clients');
