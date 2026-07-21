'use strict';

const assert = require('assert');
const fs = require('fs');

const server = fs.readFileSync('server.js', 'utf8');
const css = fs.readFileSync('public/style.css', 'utf8');

assert(server.includes("app.get('/orders/client/:orderId/profitability', requireLogin"), 'route Rentabilité absente');
assert(server.includes('Rentabilité de la commande'));
assert(server.includes('pc-profitability-access'));
assert(server.includes("pcFolderIcon('Rentabilité')"), 'pictogramme Rentabilité absent');
assert(server.includes("return `/orders/client/${order.id}/profitability#order-forecast`;"), 'les actions doivent revenir à Rentabilité');

const mainStart = server.indexOf("app.get('/pc-folders/:client/:order', requireLogin");
const mainEnd = server.indexOf("app.post('/orders/client/:id/chantier'", mainStart);
const mainRoute = server.slice(mainStart, mainEnd);
assert(mainRoute.includes('profitabilityAccessCard'));
assert(!mainRoute.includes('renderClientOrderForecastCard('), 'le prévisionnel ne doit plus être rendu sur la commande');
assert(!mainRoute.includes('renderProjectProfitabilityCard('), 'la rentabilité chantier ne doit plus être rendue sur la commande');

const profitabilityStart = server.indexOf("app.get('/orders/client/:orderId/profitability'");
const profitabilityEnd = server.indexOf("app.get('/api/orders/:id/profitability'", profitabilityStart);
const profitabilityRoute = server.slice(profitabilityStart, profitabilityEnd);
for (const renderer of [
  'renderOrderProfitabilityOverview', 'renderClientOrderForecastCard', 'renderOrderActualDetails',
  'renderProjectProfitabilityCard', 'renderOrderProfitabilityComparison'
]) assert(profitabilityRoute.includes(renderer), `rendu absent: ${renderer}`);
assert(profitabilityRoute.includes('clientOrderFolderUrl(order)'), 'retour commande absent');

assert(server.includes('Donnée réelle non renseignée'));
assert(server.includes('Facturation'));
assert(server.includes('Comparaison prévisionnel / réel'));
assert(server.includes('projectProfitabilityForOrder(order)'), 'les calculs réels existants doivent être réutilisés');
assert(server.includes('clientOrderForecastData(order)'), 'les calculs prévisionnels existants doivent être réutilisés');

assert(css.includes('.profitability-global-card'));
assert(css.includes('.profitability-comparison-grid'));
assert(css.includes('.order-profitability-page'));
assert(css.includes('env(safe-area-inset-bottom)'));
assert(css.includes('@media(max-width:600px)'));

console.log('OK - sous-dossier Rentabilité des commandes');
