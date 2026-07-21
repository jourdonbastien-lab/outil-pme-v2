'use strict';

const assert = require('assert');
const fs = require('fs');
const { renderClientOrderProfitabilityView } = require('./views/clientOrderProfitabilityView');

function data(overrides = {}) {
  const base = {
    order: { id: 7, name: 'Client Test', description: 'Portail', status: 'En cours', price: 1000, quote_id: null },
    forecastData: { lines: [], quoteLines: [], importStatus: '' },
    realData: { hours: [], costs: [], actual: {} },
    financialSnapshot: {
      revenue: { expectedExVat: 1000 },
      budget: { material: 0, labor: 0, subcontracting: 0, other: 0, total: 0 },
      margin: { forecastAmount: 1000, forecastRate: 100 },
      hours: { budgeted: 0, actual: 0 },
      sources: { budget: 'none' }
    },
    escapeHtml: (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
    formatEuroFr: (value) => `${Number(value).toFixed(2)} €`,
    clientPageIcon: (name) => `<i data-client-icon="${name}"></i>`,
    pcFolderIcon: (name) => `<i data-folder-icon="${name}"></i>`,
    calculateCostLine: (line) => ({ cost: Number(line.testCost || 0), hours: Number(line.testHours || 0) }),
    laborCategories: ['Fabrication', 'Pose'],
    materialUnits: ['u', 'ml'],
    clientOrderFolderUrl: () => '/pc-folders/Client/Portail',
    roundAmount: (value) => Math.round(Number(value || 0) * 100) / 100
  };
  return { ...base, ...overrides };
}

assert.strictEqual(typeof renderClientOrderProfitabilityView, 'function');
const source = fs.readFileSync('views/clientOrderProfitabilityView.js', 'utf8');
assert(!source.includes('better-sqlite3'));
assert(!source.includes('express'));
assert(!source.includes("require('../server')"));
assert(!/new\s+Database|\.prepare\(|\bdb\b/.test(source));

const empty = renderClientOrderProfitabilityView(data());
assert(empty.startsWith('<div class="pc-modern-page order-profitability-page">'));
for (const value of [
  'order-profitability-hero', 'profitability-global-section', 'order-forecast-card',
  'order-cost-groups', 'order-hours-tracking', 'Aucune matière ni main-d’œuvre renseignée',
  'Budget incomplet', 'Aucune heure pointée', 'Voir les heures'
]) assert(empty.includes(value), `rendu vide incomplet: ${value}`);

const budgetData = data();
budgetData.order.quote_id = 12;
budgetData.forecastData.quoteLines = [{ id: 1 }];
budgetData.forecastData.lines = [
  { id: 1, line_type: 'material', designation: 'Tube', quantity: 2, unit: 'ml', source_type: 'manual', testCost: 200 },
  { id: 2, line_type: 'labor', designation: 'Fabrication', planned_minutes: 120, source_type: 'quote', testCost: 80, testHours: 2 }
];
budgetData.financialSnapshot = {
  revenue: { expectedExVat: 1000 },
  budget: { material: 200, labor: 80, subcontracting: 50, other: 20, total: 350 },
  margin: { forecastAmount: 650, forecastRate: 65 },
  hours: { budgeted: 2, actual: 1 },
  sources: { budget: 'client_order_cost_lines' }
};
budgetData.realData = { hours: [{ minutes_total: 60 }], costs: [{ amount_ht: 20 }], actual: {} };
const populated = renderClientOrderProfitabilityView(budgetData);
for (const value of [
  'Rentable', '650.00 €', '65.0 %', 'Tube', 'Fabrication', 'Heures réalisées', '1.00 h',
  'action="/orders/client/7/cost-lines"', 'action="/orders/client/7/cost-lines/1/edit"',
  'action="/orders/client/7/cost-lines/1/duplicate"', 'action="/orders/client/7/cost-lines/1/delete"',
  'action="/orders/client/7/cost-lines/import-quote"', '>Ajouter<', '>Enregistrer<', '>Dupliquer<', '>Supprimer<'
]) assert(populated.includes(value), `rendu complet incomplet: ${value}`);

assert.strictEqual((populated.match(/id="order-budget"/g) || []).length, 1);
assert(populated.indexOf('profitability-global-section') < populated.indexOf('order-forecast-card'));
assert(populated.indexOf('order-forecast-card') < populated.indexOf('order-hours-tracking'));

console.log('OK - vue rentabilité des commandes clients');
