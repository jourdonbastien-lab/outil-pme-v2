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

const automaticComplete = profitability.analyzeQuoteLines({ lines: [
  { id: 1, category: 'Matière', label: 'Acier', qty: 1, unit: 'forfait', unit_price: 12000, total: 12000, cost_total: 8000 },
  { id: 2, category: 'Sous-traitance', label: 'Découpe laser', qty: 1, unit: 'forfait', unit_price: 4000, total: 4000, cost_total: 2000 },
  { id: 3, category: 'Prestation', cost_category: 'main-d’œuvre atelier', label: 'Fabrication atelier', qty: 1, unit: 'forfait', unit_price: 5404.70, total: 5404.70, cost_total: 4000 }
] });
assert.strictEqual(automaticComplete.totalHT, 21404.70);
assert.strictEqual(automaticComplete.materialCost, 8000);
assert.strictEqual(automaticComplete.subcontractingCost, 2000);
assert.strictEqual(automaticComplete.laborCost, 4000);
assert.strictEqual(automaticComplete.totalCost, 14000);
assert.strictEqual(automaticComplete.margin, 7404.70);
assert.strictEqual(automaticComplete.marginOnCost, 52.89);
assert.strictEqual(automaticComplete.marginOnSale, 34.59);
assert.strictEqual(automaticComplete.reliability, 'complete');

const automaticMissing = profitability.analyzeQuoteLines({ lines: [{ id: 4, category: 'Matière', label: 'Acier sans achat', qty: 1, unit: 'forfait', unit_price: 10000, total: 10000 }] });
assert.strictEqual(automaticMissing.status, 'incomplete');
assert.strictEqual(automaticMissing.margin, null);
assert.strictEqual(automaticMissing.marginOnSale, null);
assert.strictEqual(automaticMissing.counts.missing, 1);

const automaticLabor = profitability.analyzeQuoteLines({ lines: [{ id: 5, category: 'Prestation', label: 'Main d’œuvre atelier', qty: 20, unit: 'h', unit_price: 90, total: 1800 }] });
assert.strictEqual(automaticLabor.laborCost, 1100);
assert.strictEqual(automaticLabor.lines[0].origin, 'heures × coût horaire interne par défaut');

const noDuplicateAdjustment = profitability.analyzeQuoteLines({
  lines: [{ id: 6, category: 'Matière', label: 'Acier', qty: 1, unit: 'u', unit_price: 200, total: 200, cost_unit: 100 }],
  adjustments: [{ id: 'duplicate', lineId: 6, type: 'matière acier', label: 'Même acier', amount: 100 }]
});
assert.strictEqual(noDuplicateAdjustment.adjustmentsCost, 0);
assert.strictEqual(noDuplicateAdjustment.totalCost, 100);

const legacyIgnored = profitability.analyzeQuoteLines({ quote: { cout_revient: 9999 }, lines: [{ id: 7, label: 'Ligne historique', qty: 1, unit: 'u', unit_price: 500, total: 500, cost_unit: 200 }] });
assert.strictEqual(legacyIgnored.totalCost, 200, 'un ancien coût global ne doit pas être ajouté à l’analyse des lignes');

const purchaseTotalPriority = profitability.analyzeQuoteLines({ lines: [{ id: 8, label: 'Thermo', qty: 2, unit: 'u', unit_price: 500, total: 1000, cost_unit: 300, cost_total: 550 }] });
assert.strictEqual(purchaseTotalPriority.lines[0].detectedCost, 550);
assert.strictEqual(purchaseTotalPriority.lines[0].costSource, 'purchase_total');

const coefficientCost = profitability.analyzeQuoteLines({ lines: [{ id: 9, label: 'Moteur BFT', qty: 1, unit: 'u', unit_price: 270, total: 270, coefficient: 1.5 }] });
assert.strictEqual(coefficientCost.lines[0].detectedCost, 180);
assert.strictEqual(coefficientCost.lines[0].costSource, 'sale_divided_by_coefficient');

const marginFormulaCost = profitability.analyzeQuoteLines({ lines: [{ id: 10, label: 'Parclose', qty: 1, unit: 'u', unit_price: 270, total: 270, margin_pct: 50 }] });
assert.strictEqual(marginFormulaCost.lines[0].detectedCost, 180);
assert.strictEqual(marginFormulaCost.lines[0].costSource, 'margin_formula');

const productQuantityOne = profitability.analyzeQuoteLines({ lines: [{ id: 11, category: 'Fabrication', label: 'Clôture', qty: 1, unit: 'u', unit_price: 2800, total: 2800 }] });
assert.strictEqual(productQuantityOne.lines[0].detectedCost, null);
assert.strictEqual(productQuantityOne.lines[0].costSource, 'unavailable');
assert.notStrictEqual(productQuantityOne.lines[0].category, 'main-d’œuvre atelier');

const fabricationHours = profitability.analyzeQuoteLines({ lines: [{ id: 12, category: 'Prestation', label: 'Fabrication atelier', qty: 10, unit: 'h', unit_price: 80, total: 800 }] });
assert.strictEqual(fabricationHours.lines[0].detectedCost, 550);
assert.strictEqual(fabricationHours.lines[0].costSource, 'hours_times_internal_rate');
const installationHours = profitability.analyzeQuoteLines({ lines: [{ id: 13, category: 'Prestation', label: 'Pose', qty: 4, unit: 'h', unit_price: 90, total: 360 }] });
assert.strictEqual(installationHours.lines[0].detectedCost, 220);
assert.strictEqual(installationHours.lines[0].category, 'main-d’œuvre pose');

for (const field of ['purchaseUnitPrice', 'purchaseTotal', 'saleUnitPrice', 'saleTotal', 'quantity', 'marginInput', 'coefficientInput', 'detectedCost', 'costSource']) {
  assert(Object.hasOwn(coefficientCost.lines[0], field), `champ diagnostic absent: ${field}`);
}

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

const server = (fs.readFileSync('server.js', 'utf8') + fs.readFileSync('app/createApplication.js', 'utf8'));
const databaseSchema = fs.readFileSync('database/schema.js', 'utf8');
const databaseMigrations = fs.readFileSync('database/migrations.js', 'utf8');
const clientOrderRoutes = fs.readFileSync('routes/clientOrders.js', 'utf8');
for (const schema of ['quote_profitability_forecasts', 'project_profitability_forecasts', 'project_actual_costs']) {
  assert(databaseSchema.includes(`CREATE TABLE IF NOT EXISTS ${schema}`), `migration absente: ${schema}`);
}
assert(databaseMigrations.includes("ensureColumn('chantier_hours', 'category'"));
assert(databaseMigrations.includes("ensureColumn('client_orders', 'quote_id'"));
assert(
  fs.readFileSync('services/quoteAcceptanceService.js', 'utf8')
    .includes('saveProjectForecast({ ...quote, total_ht: totalWithMargin }, lines, clientOrderId)')
);
assert(clientOrderRoutes.includes("get('/api/orders/:id/profitability', 'profitabilityApi')"));
const quoteProfitabilityRoutes = fs.readFileSync('routes/quoteProfitability.js', 'utf8');
const quoteAiAnalysisRoutes = fs.readFileSync('routes/quoteAiAnalysis.js', 'utf8');
assert(quoteProfitabilityRoutes.includes("app.get('/api/devis/:id/profitability', requireLogin"));
assert(quoteProfitabilityRoutes.includes("app.post('/api/devis/:id/profitability', requireLogin"));
assert(quoteAiAnalysisRoutes.includes("app.post('/api/devis/:id/profitability/analyze', requireLogin"));
for (const column of ['analysis_json', 'manual_adjustments_json', 'reliability_level', 'analyzed_at', 'engine_version']) {
  assert(databaseMigrations.includes(`ensureColumn('quote_profitability_forecasts', '${column}'`), `migration absente: ${column}`);
}
for (const column of ['cost_unit', 'cost_total', 'margin_pct', 'hours', 'hourly_cost', 'cost_category', 'cost_source']) {
  assert(databaseMigrations.includes(`ensureColumn('quote_lines', '${column}'`), `migration ligne absente: ${column}`);
}
assert(clientOrderRoutes.includes("post('/api/orders/:id/actual-costs', 'createActualCost')"));
assert((server + fs.readFileSync('views/quoteDetailView.js', 'utf8')).includes('Rentabilité prévisionnelle'));
assert(fs.readFileSync('views/clientOrderProfitabilityView.js', 'utf8').includes('Résultat de la commande'));
assert(fs.readFileSync('views/quoteDetailView.js', 'utf8').includes('Réanalyser le devis'));
assert(databaseSchema.includes('idx_project_actual_costs_supplier_invoice'), 'anti-doublon facture fournisseur absent');

console.log('OK - rentabilité lots 1 à 5');
