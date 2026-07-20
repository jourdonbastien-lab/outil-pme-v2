'use strict';

const assert = require('assert');
const fs = require('fs');
const profitability = require('./lib/projectProfitability');

function lines(total = 10000) {
  return [{ category: 'Fabrication', label: 'Ouvrage acier', qty: 1, unit_price: total, total }];
}

const oldQuote = profitability.calculateForecast({}, lines(10000));
assert.strictEqual(oldQuote.forecastCost, 0);
assert.strictEqual(oldQuote.riskLevel, 'incomplete');
assert.strictEqual(oldQuote.margin, null);
assert.strictEqual(oldQuote.marginOnSale, null);
assert.strictEqual(oldQuote.minimumPrice, null);

const detailed = {
  title: 'Portail coulissant', cout_matiere: 3000, cout_sous_traitance: 500,
  cout_galvanisation: 300, cout_thermolaquage: 400, cout_motorisation: 600,
  cout_accessoires: 200, cout_transport: 150, cout_consommables: 100,
  cout_locations: 50, heures_etude: 5, heures_atelier: 20, heures_pose: 5, cout_horaire: 50
};
const green = profitability.calculateForecast(detailed, lines(10000));
assert.strictEqual(green.laborCost, 1500);
assert.strictEqual(green.forecastCost, 6800);
assert.strictEqual(green.margin, 3200);
assert.strictEqual(green.marginOnSale, 32);
assert.strictEqual(green.riskLevel, 'green');
assert.strictEqual(green.minimumPrice, 8500);
assert.strictEqual(green.category, 'portail');

const orange = profitability.calculateForecast({ cout_revient: 7500 }, lines(10000));
assert.strictEqual(orange.marginOnSale, 25);
assert.strictEqual(orange.riskLevel, 'orange');

const red = profitability.calculateForecast({ cout_revient: 8500 }, lines(10000));
assert.strictEqual(red.marginOnSale, 15);
assert.strictEqual(red.riskLevel, 'red');

const loss = profitability.calculateForecast({ cout_revient: 12000 }, lines(10000));
assert.strictEqual(loss.riskLevel, 'red');
assert.strictEqual(loss.critical, true);
assert.strictEqual(loss.margin, -2000);

const requestedExample = profitability.calculateForecast({ cout_revient: 14000 }, lines(21404.70));
assert.strictEqual(requestedExample.margin, 7404.70);
assert.strictEqual(requestedExample.marginOnCost, 52.89);
assert.strictEqual(requestedExample.marginOnSale, 34.59);
assert.strictEqual(requestedExample.minimumPrice, 17500);
assert.strictEqual(requestedExample.targetPrice, 20000);
assert.strictEqual(requestedExample.comfortablePrice, 21538.46);

const multipleCategories = profitability.calculateForecast({ title: 'Clôture avec portail motorisé et portillon', cout_revient: 100 }, lines(1000));
assert.deepStrictEqual(multipleCategories.categories, ['portillon', 'portail', 'clôture', 'motorisation']);

const quoteBefore = JSON.stringify(detailed);
const lineBefore = JSON.stringify(lines(10000));
const snapshot = profitability.buildForecastSnapshot({ id: 8, ...detailed }, lines(10000));
assert.strictEqual(snapshot.quoteId, 8);
assert(snapshot.capturedAt);
assert.strictEqual(JSON.stringify(detailed), quoteBefore, 'le calcul ne modifie pas le devis');
assert.strictEqual(JSON.stringify(lines(10000)), lineBefore, 'le calcul ne modifie pas les lignes');

const actual = profitability.calculateActual({
  order: { id: 4, price: 10000 },
  forecast: snapshot,
  hours: [
    { category: 'atelier', minutes_total: 1800 },
    { category: 'pose', minutes_total: 600 },
    { category: null, minutes_total: 120 }
  ],
  costs: [
    { cost_type: 'material', amount_ht: 3200 },
    { cost_type: 'subcontracting', amount_ht: 700 },
    { cost_type: 'other', amount_ht: 100 }
  ],
  invoices: [{ amount_ht: 6000 }, { amount_ht: 4000 }]
});
assert.strictEqual(actual.actualHours, 42);
assert.strictEqual(actual.hoursByCategory.autre, 2, 'les anciennes heures restent comptées');
assert.strictEqual(actual.laborCost, 2100);
assert.strictEqual(actual.purchasesCost, 4000);
assert.strictEqual(actual.actualCost, 6100);
assert.strictEqual(actual.revenueHT, 10000);
assert.strictEqual(actual.margin, 3900);
assert.strictEqual(actual.marginOnSale, 39);
assert.strictEqual(actual.hourVariance, 12);
assert.strictEqual(actual.hourVariancePct, 40);

const server = fs.readFileSync('server.js', 'utf8');
for (const schema of ['quote_profitability_forecasts', 'project_profitability_forecasts', 'project_actual_costs']) {
  assert(server.includes(`CREATE TABLE IF NOT EXISTS ${schema}`), `migration absente: ${schema}`);
}
assert(server.includes("ensureColumn('chantier_hours', 'category'"));
assert(server.includes("ensureColumn('client_orders', 'quote_id'"));
assert(server.includes('saveProjectForecast({ ...quote, total_ht: totalWithMargin }, lines, clientOrderId)'));
assert(server.includes("app.get('/api/orders/:id/profitability', requireLogin"));
assert(server.includes("app.get('/api/devis/:id/profitability', requireLogin"));
assert(server.includes("app.post('/api/devis/:id/profitability', requireLogin"));
assert(server.includes("app.post('/api/devis/:id/profitability/analyze', requireLogin"));
assert(server.includes("app.post('/api/orders/:id/actual-costs', requireLogin"));
assert(server.includes('Rentabilité prévisionnelle'));
assert(server.includes('Rentabilité du chantier'));
assert(server.includes('Analyser la rentabilité'));
assert(server.includes('idx_project_actual_costs_supplier_invoice'), 'anti-doublon facture fournisseur absent');

console.log('OK - rentabilité lots 1 à 5');
