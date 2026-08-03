'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');

const server = (fs.readFileSync('server.js', 'utf8') + fs.readFileSync('app/createApplication.js', 'utf8'));
const service = fs.readFileSync('services/clientOrderProfitabilityService.js', 'utf8');
assert(server.includes("require('../services/clientOrderProfitabilityService')"));
assert(server.includes('createClientOrderProfitabilityService({'));
for (const name of ['latestProjectForecast', 'saveProjectForecast', 'projectProfitabilityForOrder', 'clientOrderForecastData', 'importMissingQuoteCostLines']) {
  assert(!server.includes(`function ${name}(`), `${name} est encore inline dans server.js`);
}
for (const dead of ['renderProjectProfitabilityCard', 'renderOrderActualDetails', 'renderOrderProfitabilityComparison']) {
  assert(!server.includes(`function ${dead}(`), `${dead} devrait être supprimée`);
}
assert(!/\b(?:req|res)\./.test(service), 'le service ne doit pas dépendre d’Express');
assert(!service.includes("require('../server"));
for (const canonicalCall of ['projectProfitability.buildForecastSnapshot', 'projectProfitability.calculateActual', 'clientOrderCostLines.quoteLineToCostLine', 'clientOrderCostLines.summarize', 'getClientOrderFinancialSnapshot(db, orderId)']) assert(service.includes(canonicalCall));
for (const injection of ['saveProjectForecast: clientOrderProfitabilityService.saveProjectForecast', 'projectProfitabilityForOrder: clientOrderProfitabilityService.getOrderProfitability', 'getFinancialSnapshot: clientOrderProfitabilityService.getFinancialSnapshot']) assert(server.includes(injection));

const protectedHashes = {
  'lib/clientOrderFinancialSnapshot.js': 'f839c5ab60f9fb13d3fc49ce3e51dde73d9a889a',
  'lib/clientOrderCostLines.js': 'a55a09e38c6a3f002dd839a1c3d65d1d752e2162',
  'lib/projectProfitability.js': 'c45250fe947c068628ddb6c22d53918438d4a898',
  'views/clientOrderProfitabilityView.js': '52dff2cffa5c475ec27979362bb901ae9972b4d9',
  'routes/clientOrders.js': 'f35aa7765f031b456a6981dfec6be524aab687c1',
  'routes/quotes.js': '06981d958aa586873d851317560d6419cf95f91b',
  'services/dashboardService.js': '42b4ac0cbc4b6ca1bf6e0ba60357d92e8a70de06'
};
for (const [file, expected] of Object.entries(protectedHashes)) {
  const actual = crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
  assert.strictEqual(actual, expected, `${file} a été modifié hors périmètre`);
}
console.log('OK - architecture rentabilité partagée résiduelle');
