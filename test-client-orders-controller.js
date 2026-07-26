'use strict';
const assert = require('assert');
const { createClientOrdersController } = require('./controllers/clientOrdersController');
assert.throws(() => createClientOrdersController({}), /Service commandes/);
const created = [];
const service = {
  quoteExists: () => true, createOrder: (value) => { created.push(value); return { lastInsertRowid: 9 }; },
  completeOrder() {}, getOrderById: () => null
};
const controller = createClientOrdersController({
  orderService: service, renderListPage: () => {}, parseOptionalVatRate: () => 20,
  normalizeChantierStatus: () => 'À préparer', parsePositiveNumber: () => 2, parseOptionalId: () => null,
  parseDecimalInput: Number, isoDate: () => '2026-07-26', importMissingQuoteCostLines() {},
  ensureOrderFolders() {}, safeName: String, getProgressFromChantierStatus: () => 0
});
let status;
controller.createClientOrder({ body: {} }, { status: (code) => { status = code; return { send() {} }; } });
assert.strictEqual(status, 400);
let redirect;
controller.createClientOrder({ body: { name: 'Client', description: 'Portail' } }, { redirect: (url) => { redirect = url; } });
assert.strictEqual(created[0].name, 'Client');
assert.strictEqual(redirect, '/orders/clients');
controller.updateClientOrder({ params: { id: 404 }, body: {} }, { redirect: (url) => { redirect = url; } });
assert.strictEqual(redirect, '/orders/clients?orderUpdate=notfound');
console.log('OK - contrôleur commandes clients');
