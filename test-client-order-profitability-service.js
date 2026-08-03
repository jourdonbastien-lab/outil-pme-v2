'use strict';

const assert = require('assert');
const Database = require('better-sqlite3');
const projectProfitability = require('./lib/projectProfitability');
const clientOrderCostLines = require('./lib/clientOrderCostLines');
const { createClientOrderProfitabilityService } = require('./services/clientOrderProfitabilityService');

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE project_profitability_forecasts (id INTEGER PRIMARY KEY, quote_id INTEGER, client_order_id INTEGER, total_ht REAL, material_cost REAL, subcontracting_cost REAL, galvanizing_cost REAL, powder_coating_cost REAL, motorization_cost REAL, accessories_cost REAL, transport_cost REAL, consumables_cost REAL, rental_cost REAL, study_hours REAL, workshop_hours REAL, installation_hours REAL, hourly_cost REAL, forecast_cost REAL, forecast_margin REAL, forecast_margin_rate REAL, work_category TEXT, snapshot_json TEXT, created_at TEXT);
  CREATE TABLE chantier_hours (id INTEGER PRIMARY KEY, client_order_id INTEGER, client TEXT, order_name TEXT, minutes_total INTEGER, category TEXT);
  CREATE TABLE project_actual_costs (id INTEGER PRIMARY KEY, client_order_id INTEGER, cost_type TEXT, amount_ht REAL, cost_date TEXT);
  CREATE TABLE client_order_invoices (id INTEGER PRIMARY KEY, client_order_id INTEGER, total_ht REAL, invoice_date TEXT);
  CREATE TABLE quote_lines (id INTEGER PRIMARY KEY, quote_id INTEGER, position INTEGER, label TEXT, qty REAL, unit TEXT, unit_price REAL, cost_unit REAL, cost_total REAL, category TEXT);
  CREATE TABLE client_order_cost_line_exclusions (client_order_id INTEGER, source_quote_line_id INTEGER);
  CREATE TABLE client_order_cost_lines (id INTEGER PRIMARY KEY, client_order_id INTEGER, line_type TEXT, category TEXT, designation TEXT, quantity REAL, unit TEXT, unit_cost_ht REAL, unit_sale_ht REAL, planned_minutes INTEGER, hourly_cost_ht REAL, hourly_sale_ht REAL, notes TEXT, source_type TEXT, source_quote_line_id INTEGER, sort_order INTEGER, created_at TEXT, updated_at TEXT, UNIQUE(client_order_id, source_type, source_quote_line_id));
`);

let snapshotCalls = 0;
const service = createClientOrderProfitabilityService({
  db, projectProfitability, clientOrderCostLines,
  safeName: (value) => String(value || '').replace(/\s+/g, '_'),
  clientOrderFolderName: (order) => String(order.description || `Commande_${order.id}`).replace(/\s+/g, '_'),
  getClientOrderFinancialSnapshot(database, orderId) { snapshotCalls += 1; assert.strictEqual(database, db); return { orderId }; },
  createDate: () => new Date('2026-08-03T18:30:00.000Z')
});

assert.strictEqual(service.getProjectForecast(1), null);
const quote = { id: 9, title: 'Portail', total_ht: 1000, cout_horaire: 50 };
const quoteLines = [{ id: 91, label: 'Tube acier', qty: 10, unit: 'ml', unit_price: 20, cost_unit: 8 }];
const saved = service.saveProjectForecast(quote, quoteLines, 1);
assert.deepStrictEqual(service.getProjectForecast(1), { ...saved, forecastId: 1 });
assert.strictEqual(db.prepare('SELECT created_at FROM project_profitability_forecasts').get().created_at, '2026-08-03T18:30:00.000Z');
db.prepare(`INSERT INTO project_profitability_forecasts
  (id, quote_id, client_order_id, total_ht, material_cost, hourly_cost, forecast_margin_rate, snapshot_json, created_at)
  VALUES (2, 10, 2, NULL, NULL, NULL, NULL, 'JSON invalide', '2026-08-03T18:31:00.000Z')`).run();
const fallbackForecast = service.getProjectForecast(2);
assert.strictEqual(fallbackForecast.totalHT, 0);
assert.strictEqual(fallbackForecast.hourlyCost, projectProfitability.PROFITABILITY_RULES.defaultHourlyCost);
assert.strictEqual(fallbackForecast.marginOnSale, null);

db.prepare('INSERT INTO chantier_hours VALUES (?, ?, ?, ?, ?, ?)').run(1, 1, null, null, 120, 'atelier');
db.prepare('INSERT INTO chantier_hours VALUES (?, ?, ?, ?, ?, ?)').run(2, null, 'Client_Test', 'Commande_test', 60, 'pose');
db.prepare('INSERT INTO project_actual_costs VALUES (?, ?, ?, ?, ?)').run(1, 1, 'material', 125, '2026-08-02');
db.prepare('INSERT INTO project_actual_costs VALUES (?, ?, ?, ?, ?)').run(2, 1, 'other', 25, '2026-08-03');
db.prepare('INSERT INTO client_order_invoices VALUES (?, ?, ?, ?)').run(1, 1, 800, '2026-08-01');
db.prepare('INSERT INTO client_order_invoices VALUES (?, ?, ?, ?)').run(2, 1, 100, '2026-08-02');
const order = { id: 1, name: 'Client Test', description: 'Commande test', quote_id: 9, price: 1000 };
const profitability = service.getOrderProfitability(order);
assert.strictEqual(profitability.hours.length, 2, 'les heures directes et historiques restent prises en compte');
assert.deepStrictEqual(profitability.costs.map((row) => row.amount_ht), [25, 125]);
assert.deepStrictEqual(profitability.invoices.map((row) => row.total_ht), [100, 800]);
assert.deepStrictEqual(profitability.actual, projectProfitability.calculateActual({ order, forecast: profitability.forecast, hours: profitability.hours, costs: profitability.costs, invoices: profitability.invoices }));

db.prepare('INSERT INTO quote_lines VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(91, 9, 1, 'Tube acier', 10, 'ml', 20, 8, null, 'Matière');
db.prepare('INSERT INTO quote_lines VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(92, 9, 2, 'Pose', 2, 'h', 60, null, 100, 'Pose');
db.prepare('INSERT INTO client_order_cost_line_exclusions VALUES (?, ?)').run(1, 92);
assert.deepStrictEqual(service.importMissingQuoteCostLines(0, 9), { imported: 0, available: 0 });
assert.deepStrictEqual(service.importMissingQuoteCostLines(1, 9), { imported: 1, available: 2 });
assert.deepStrictEqual(service.importMissingQuoteCostLines(1, 9), { imported: 0, available: 2 }, 'anti-doublon conservé');
const forecastData = service.getOrderForecastData(order);
assert.strictEqual(forecastData.lines.length, 1);
assert.strictEqual(forecastData.quoteLines.length, 2);
assert.strictEqual(forecastData.summary.actualHours, 3);
assert.strictEqual(forecastData.summary.actualMaterialCost, 125);

assert.deepStrictEqual(service.getFinancialSnapshot(1), { orderId: 1 });
assert.strictEqual(snapshotCalls, 1);
assert.strictEqual(service.clientOrderDetailRedirect(order), '/orders/client/1/profitability#order-budget');
assert.strictEqual(service.clientOrderFolderUrl(order), '/pc-folders/Client_Test/Commande_test');

const failingService = createClientOrderProfitabilityService({ db: { prepare() { throw new Error('SQLite test'); } } });
assert.throws(() => failingService.getActualCosts(1), /SQLite test/);

db.close();
console.log('OK - service de rentabilité partagée des commandes');
