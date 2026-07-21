'use strict';

const assert = require('assert');
const fs = require('fs');

const server = fs.readFileSync('server.js', 'utf8');
const clientOrderRoutes = fs.readFileSync('routes/clientOrders.js', 'utf8');
const profitabilityController = fs.readFileSync('controllers/clientOrderProfitabilityController.js', 'utf8');
const profitabilityView = fs.readFileSync('views/clientOrderProfitabilityView.js', 'utf8');
const invoicesController = fs.readFileSync('controllers/clientOrderInvoicesController.js', 'utf8');
const css = fs.readFileSync('public/style.css', 'utf8');

assert(clientOrderRoutes.includes("get('/orders/client/:orderId/profitability', 'profitabilityPage')"));
assert(server.includes('pc-profitability-access'));
assert(server.includes("return `/orders/client/${order.id}/profitability#order-budget`;"));

const routeStart = profitabilityController.indexOf('function showProfitability');
const routeEnd = profitabilityController.indexOf('function getProfitabilityApi', routeStart);
const route = profitabilityController.slice(routeStart, routeEnd);
assert(route.includes('renderClientOrderProfitabilityView'));
for (const removed of ['renderOrderActualDetails', 'renderOrderProfitabilityComparison', 'renderProjectProfitabilityCard']) assert(!route.includes(`${removed}(`), `ancienne zone encore rendue: ${removed}`);

for (const heading of ['Résultat de la commande', '<h2>Budget de la commande</h2>', '<h2>Suivi des heures</h2>']) assert(profitabilityView.includes(heading), `zone absente: ${heading}`);
for (const state of ['Rentable', 'À surveiller', 'En perte', 'Budget incomplet']) assert(profitabilityView.includes(state));
assert(server.includes("require('./lib/clientOrderFinancialSnapshot')"));
assert(profitabilityView.includes('financialSnapshot.margin.forecastAmount'));
assert(profitabilityView.includes('financialSnapshot.margin.forecastRate'));
assert(profitabilityView.includes('financialSnapshot.budget.total'));
assert(server.includes('financialSnapshot.revenue.remainingToInvoiceExVat'));
assert(server.includes('const financialSnapshots = new Map(orders.map'));
assert(invoicesController.includes('getClientOrderFinancialSnapshot'));
assert(server.includes('financialSnapshot.revenue.invoicedExVat'));
assert(profitabilityView.includes("financialSnapshot.sources.budget === 'none'"));

assert(profitabilityView.includes('id="order-budget"'));
assert(profitabilityView.includes('class="order-cost-group"'));
assert(!profitabilityView.includes('class="order-cost-group" open'));
for (const origin of ['Issu du devis', 'Ajout manuel']) assert(profitabilityView.includes(origin));
for (const action of ['Ajouter de la main-d’œuvre', 'Ajouter de la matière', 'Ajouter un autre coût', 'Modifier', 'Dupliquer', 'Supprimer']) assert(profitabilityView.includes(action));

const hoursStart = profitabilityView.indexOf('function renderHoursTracking');
const hoursEnd = profitabilityView.indexOf('return `<div class="pc-modern-page', hoursStart);
const hoursRenderer = profitabilityView.slice(hoursStart, hoursEnd);
for (const label of ['Heures prévues', 'Heures réalisées', 'Écart', 'Voir les heures']) assert(hoursRenderer.includes(label));
assert(!hoursRenderer.includes('laborCost'));

assert(server.includes('function importMissingQuoteCostLines'));
assert(server.includes('INSERT OR IGNORE INTO client_order_cost_lines'));
assert(server.includes('source_quote_line_id'));
assert(profitabilityController.includes('client_order_cost_line_exclusions'));
assert(profitabilityController.includes('`imported-${result.imported}`'));
assert(profitabilityController.includes('importStatus=no-quote'));
assert(server.includes("name=\"quote_id\""), 'rattachement de devis absent des formulaires commande');

for (const selector of ['.profitability-global-section', '.order-cost-group', '.order-hours-summary', '.order-budget-flash']) assert(css.includes(selector));
assert(css.includes('env(safe-area-inset-bottom)'));
assert(css.includes('@media(max-width:600px)'));
assert(css.includes('.order-hours-summary{grid-template-columns:minmax(0,1fr)'));

console.log('OK - budget unifié des commandes');
