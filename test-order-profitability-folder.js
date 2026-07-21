'use strict';

const assert = require('assert');
const fs = require('fs');

const server = fs.readFileSync('server.js', 'utf8');
const css = fs.readFileSync('public/style.css', 'utf8');

assert(server.includes("app.get('/orders/client/:orderId/profitability', requireLogin"));
assert(server.includes('pc-profitability-access'));
assert(server.includes("return `/orders/client/${order.id}/profitability#order-forecast`;"));

const mainStart = server.indexOf("app.get('/pc-folders/:client/:order', requireLogin");
const mainEnd = server.indexOf("app.post('/orders/client/:id/chantier'", mainStart);
const mainRoute = server.slice(mainStart, mainEnd);
assert(mainRoute.includes('profitabilityAccessCard'));
assert(!mainRoute.includes('renderClientOrderForecastCard('));
assert(!mainRoute.includes('renderProjectProfitabilityCard('));

const routeStart = server.indexOf("app.get('/orders/client/:orderId/profitability'");
const routeEnd = server.indexOf("app.get('/api/orders/:id/profitability'", routeStart);
const route = server.slice(routeStart, routeEnd);
for (const renderer of ['renderOrderProfitabilityOverview', 'renderClientOrderForecastCard', 'renderOrderActualDetails', 'renderOrderProfitabilityComparison']) {
  assert(route.includes(renderer), `rendu absent: ${renderer}`);
}
assert(!route.includes('renderProjectProfitabilityCard('), 'ancien bloc comptable encore affiché');
assert(route.includes('clientOrderFolderUrl(order)'));

for (const heading of ['Résultat global', '<h2>Prévisionnel</h2>', '<h2>Réel</h2>', '<h2>Écarts</h2>']) {
  assert(server.includes(heading), `zone absente: ${heading}`);
}
for (const state of ['Rentable', 'À surveiller', 'En perte', 'Données incomplètes']) assert(server.includes(state));
assert(server.includes('(actualMargin / contractPrice) * 100'), 'marge réelle non fondée sur le prix contractuel');
assert(server.includes('round2(contractPrice - actual.actualCost)'));

assert(server.includes('class="order-cost-group"'), 'groupes prévisionnels non repliables');
assert(!server.includes('class="order-cost-group" open'), 'groupes ouverts par défaut');
for (const action of ['Modifier', 'Dupliquer', 'Supprimer', 'Importer les lignes du devis']) assert(server.includes(action));
for (const link of ['/Heure%20chantier', '/Factures', '/Devis']) assert(server.includes(`href="${'${folderUrl}'}${link}`), `lien absent: ${link}`);
assert(server.includes('Options avancées'));
assert(server.includes("lineType === 'other'"));

const actualRendererStart = server.indexOf('function renderOrderActualDetails');
const actualRendererEnd = server.indexOf('function renderOrderProfitabilityComparison', actualRendererStart);
const actualRenderer = server.slice(actualRendererStart, actualRendererEnd);
for (const forbidden of ['invoice_number', 'invoice_date', 'hoursByCategory', 'Reste à facturer', 'Facturé HT']) {
  assert(!actualRenderer.includes(forbidden), `détail réel répété: ${forbidden}`);
}

const comparisonStart = server.indexOf('function renderOrderProfitabilityComparison');
const comparisonEnd = server.indexOf('function orderInvoiceSummary', comparisonStart);
const comparison = server.slice(comparisonStart, comparisonEnd);
assert(comparison.includes("['Heures'"));
assert(comparison.includes("['Main-d’œuvre'"));
assert(comparison.includes("['Matière'"));
assert(comparison.includes("['Coût total'"));
assert(!comparison.includes("['Autres coûts'"));
assert(!comparison.includes("['Marge'"));

for (const selector of ['.profitability-main-columns', '.profitability-global-section', '.order-cost-group', '.profitability-folder-links']) assert(css.includes(selector));
assert(css.includes('env(safe-area-inset-bottom)'));
assert(css.includes('@media(max-width:600px)'));
assert(css.includes('grid-template-columns:minmax(0,1fr)'));

console.log('OK - page Rentabilité simplifiée');
