'use strict';
const assert = require('assert');
const fs = require('fs');
const { createClientOrderPurchasesController } = require('./controllers/clientOrderPurchasesController');
assert.throws(() => createClientOrderPurchasesController(), /purchaseService is required/);
const operations = [];
const purchaseService = {
  getOrder: () => ({ id: 7, name: 'Client' }), getPurchase: () => ({ id: 3 }),
  createPurchase: (...args) => operations.push(['create', ...args]), updatePurchase: (...args) => operations.push(['update', ...args]),
  deletePurchase: (...args) => operations.push(['delete', ...args])
};
const controller = createClientOrderPurchasesController({ purchaseService, parseDecimalInput: (value, fallback) => value === undefined ? fallback : Number(value), normalizePurchaseStatus: (value) => value || 'À commander', getPurchaseOrderRedirect: () => '/folder/Commandes' });
const response = () => ({ code: 200, body: null, redirectUrl: null, status(code) { this.code = code; return this; }, send(body) { this.body = body; return this; }, redirect(url) { this.redirectUrl = url; return this; } });
for (const [name, params] of [['addPurchase', { id: '7' }], ['updatePurchase', { id: '7', purchaseId: '3' }], ['deletePurchase', { id: '7', purchaseId: '3' }]]) {
  const res = response(); controller[name]({ params, body: { designation: 'Tube', qty: '2' } }, res); assert.strictEqual(res.redirectUrl, '/folder/Commandes');
}
assert.deepStrictEqual(operations.map((item) => item[0]), ['create', 'update', 'delete']);
let res = response(); controller.addPurchase({ params: { id: '7' }, body: {} }, res); assert.strictEqual(res.code, 400); assert.strictEqual(res.body, 'Désignation requise');
purchaseService.getOrder = () => null; res = response(); controller.deletePurchase({ params: { id: '99', purchaseId: '3' }, body: {} }, res); assert.strictEqual(res.code, 404);
const source = fs.readFileSync('controllers/clientOrderPurchasesController.js', 'utf8'); assert(!source.includes("require('../server')")); assert(!/new\s+Database|\.prepare\(/.test(source));
console.log('OK - contrôleur achats commandes clients');
