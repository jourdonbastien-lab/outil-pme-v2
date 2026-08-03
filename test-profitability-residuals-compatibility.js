'use strict';

const assert = require('assert');
const { createClientOrderProfitabilityService } = require('./services/clientOrderProfitabilityService');

const order = { id: 7, name: 'Client historique', description: 'Portail ancien', price: 4200 };
const forecast = { totalHT: 4200, forecastCost: 2600, hours: { total: 20 } };
const hours = [{ id: 1, client_order_id: 7, minutes_total: 1380 }];
const costs = [{ id: 2, client_order_id: 7, cost_type: 'material', amount_ht: 900, cost_date: '2026-07-02' }];
const invoices = [{ id: 3, client_order_id: 7, total_ht: 3000, invoice_date: '2026-07-03' }];
const calls = [];
const db = {
  prepare(sql) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    return {
      get() {
        calls.push(['get', normalized, [...arguments]]);
        if (normalized.includes('project_profitability_forecasts')) return { id: 5, snapshot_json: JSON.stringify(forecast) };
        throw new Error(`Requête get inattendue: ${normalized}`);
      },
      all() {
        calls.push(['all', normalized, [...arguments]]);
        if (normalized.includes('chantier_hours')) return hours;
        if (normalized.includes('project_actual_costs')) return costs;
        if (normalized.includes('client_order_invoices')) return invoices;
        throw new Error(`Requête all inattendue: ${normalized}`);
      }
    };
  }
};
let actualInput;
const historicalActual = {
  revenueHT: 4200, invoicedHT: 3000, remainingToInvoice: 1200,
  actualHours: 23, actualCost: 2165, margin: 2035, marginOnSale: 48.45
};
const service = createClientOrderProfitabilityService({
  db,
  safeName: (value) => String(value).replace(/\s+/g, '_'),
  projectProfitability: {
    calculateActual(input) { actualInput = input; return historicalActual; },
    PROFITABILITY_RULES: { defaultHourlyCost: 55 }
  }
});
const result = service.getOrderProfitability(order);
assert.deepStrictEqual(result, { forecast: { ...forecast, forecastId: 5 }, hours, costs, invoices, actual: historicalActual });
assert.deepStrictEqual(actualInput, { order, forecast: result.forecast, hours, costs, invoices }, 'les factures restent une entrée de chiffre d’affaires distincte des coûts');
assert(calls.some(([, sql]) => sql.includes('client_order_id = ? OR (client_order_id IS NULL AND client = ? AND order_name = ?)')));
assert(calls.some(([, sql]) => sql.endsWith('ORDER BY cost_date DESC, id DESC')));
assert(calls.some(([, sql]) => sql.endsWith('ORDER BY invoice_date DESC, id DESC')));
console.log('OK - compatibilité rentabilité partagée résiduelle');
