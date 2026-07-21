'use strict';

const assert = require('assert');
const fs = require('fs');
const { createClientOrderProfitabilityController } = require('./controllers/clientOrderProfitabilityController');

function response() {
  return {
    statusCode: 200, body: undefined, redirects: [], responses: 0,
    status(code) { this.statusCode = code; return this; },
    send(value) { this.body = value; this.responses += 1; return this; },
    json(value) { this.body = value; this.responses += 1; return this; },
    redirect(value) { this.redirects.push(value); this.responses += 1; return this; }
  };
}

function setup(options = {}) {
  const order = options.order === undefined ? { id: 7, name: 'Client', description: 'Portail', quote_id: 3 } : options.order;
  const line = options.line === undefined ? { id: 4, client_order_id: 7, designation: 'Tube', source_type: 'manual', sort_order: 0 } : options.line;
  const runs = [];
  const db = {
    prepare(sql) {
      return {
        get(...params) {
          if (sql.includes('FROM client_order_cost_lines')) return line;
          if (sql.includes('FROM client_orders')) return order;
          return null;
        },
        run(...params) {
          if (options.runError) throw options.runError;
          runs.push({ sql, params });
          return { changes: options.changes ?? 1, lastInsertRowid: 11 };
        }
      };
    }
  };
  let snapshotCalls = 0;
  const dependencies = {
    db,
    pageTemplate: (req, title, content) => `${title}:${content}`,
    escapeHtml: (value) => String(value),
    formatEuroFr: (value) => `${value} €`,
    isoDate: () => '2026-07-21',
    getClientOrderFinancialSnapshot: () => { snapshotCalls += 1; return { budget: {}, hours: {}, margin: {}, revenue: {} }; },
    validateClientOrderCostLine: (input) => ({
      line_type: input.line_type || 'material', category: null, designation: input.designation || 'Tube',
      quantity: 1, unit: 'u', unit_cost_ht: 10, unit_sale_ht: 20, planned_minutes: 0,
      hourly_cost_ht: 0, hourly_sale_ht: 0, supplier: null, notes: null
    }),
    clientOrderForecastData: () => ({ lines: [] }),
    projectProfitabilityForOrder: () => ({ forecast: { id: 1 }, actual: { total: 2 }, costs: [{ id: 3 }], hours: [] }),
    renderOrderProfitabilityOverview: () => '<overview>',
    renderClientOrderForecastCard: () => '<budget>',
    renderOrderHoursTracking: () => '<hours>',
    clientOrderFolderUrl: () => '/folder',
    clientOrderDetailRedirect: (value) => `/orders/client/${value.id}/profitability#order-budget`,
    importMissingQuoteCostLines: () => ({ imported: options.imported ?? 2 }),
    actualCostTypes: ['material', 'other']
  };
  return { controller: createClientOrderProfitabilityController(dependencies), dependencies, runs, get snapshotCalls() { return snapshotCalls; } };
}

assert.strictEqual(typeof createClientOrderProfitabilityController, 'function');
assert.throws(() => createClientOrderProfitabilityController({}), /db is required/);
const source = fs.readFileSync('controllers/clientOrderProfitabilityController.js', 'utf8');
assert(!source.includes("require('../server')"));
assert(!/new\s+Database|sqlite3\.Database/.test(source));
assert(source.includes('getClientOrderFinancialSnapshot'));
assert(source.includes('validateClientOrderCostLine'));

const context = setup();
for (const name of [
  'showProfitability', 'getProfitabilityApi', 'addActualCost', 'deleteActualCost',
  'addBudgetLine', 'updateBudgetLine', 'duplicateBudgetLine', 'deleteBudgetLine', 'importBudgetFromQuote'
]) assert.strictEqual(typeof context.controller[name], 'function', `${name} absent`);

let res = response();
context.controller.getProfitabilityApi({ params: { id: '7' } }, res);
assert.deepStrictEqual(Object.keys(res.body), ['success', 'orderId', 'forecast', 'actual', 'costs', 'financialSnapshot']);
assert.strictEqual(context.snapshotCalls, 1);
assert.strictEqual(res.responses, 1);

for (const [name, req] of [
  ['addBudgetLine', { params: { orderId: '7' }, body: { designation: 'Tube' } }],
  ['updateBudgetLine', { params: { orderId: '7', lineId: '4' }, body: { designation: 'Tube' } }],
  ['duplicateBudgetLine', { params: { orderId: '7', lineId: '4' }, body: {} }],
  ['deleteBudgetLine', { params: { orderId: '7', lineId: '4' }, body: {} }]
]) {
  res = response();
  context.controller[name](req, res);
  assert.deepStrictEqual(res.redirects, ['/orders/client/7/profitability#order-budget'], `${name}: redirection modifiée`);
  assert.strictEqual(res.responses, 1, `${name}: double réponse`);
}

res = response();
context.controller.importBudgetFromQuote({ params: { orderId: '7' }, body: {} }, res);
assert.deepStrictEqual(res.redirects, ['/orders/client/7/profitability?importStatus=imported-2#order-budget']);

res = response();
setup({ order: null }).controller.getProfitabilityApi({ params: { id: '99' } }, res);
assert.strictEqual(res.statusCode, 404);
assert.deepStrictEqual(res.body, { success: false, error: 'Commande introuvable' });

res = response();
setup({ line: null }).controller.updateBudgetLine({ params: { orderId: '7', lineId: '99' }, body: {} }, res);
assert.strictEqual(res.statusCode, 404);
assert.strictEqual(res.body, 'Ligne introuvable pour cette commande');

res = response();
context.controller.addBudgetLine({ params: { orderId: 'abc' }, body: {} }, res);
assert.strictEqual(res.statusCode, 400);
assert.strictEqual(res.responses, 1);

res = response();
context.controller.addActualCost({ params: { id: '7' }, body: { cost_type: 'material', amount_ht: '12.5' }, session: { user: { id: 2 } } }, res);
assert.strictEqual(res.statusCode, 201);
assert.deepStrictEqual(res.body, { success: true, id: 11 });

res = response();
setup({ runError: new Error('UNIQUE constraint failed') }).controller.addActualCost({
  params: { id: '7' }, body: { cost_type: 'material', amount_ht: '12.5' }, session: { user: { id: 2 } }
}, res);
assert.strictEqual(res.statusCode, 409);
assert.strictEqual(res.body.error, 'Cette facture fournisseur est déjà rattachée.');
assert.strictEqual(res.responses, 1);

console.log('OK - contrôleur rentabilité et budget des commandes');
