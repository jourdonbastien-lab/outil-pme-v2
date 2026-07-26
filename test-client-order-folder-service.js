'use strict';
const assert = require('assert');
const { createClientOrderFolderService } = require('./services/clientOrderFolderService');
assert.throws(() => createClientOrderFolderService({}), /Service commandes/);
const orders = [
  { id: 2, name: 'Client', description: 'Portail' },
  { id: 1, name: 'Client', description: null }
];
const service = createClientOrderFolderService({
  orderService: { listAllOrdersNewestFirst: () => orders, getOrderById: (id) => orders.find((order) => order.id === id) },
  safeName: (v) => String(v || '').trim(),
  joinPath: (...parts) => parts.join('/'),
  supportedFolderTypes: ['Devis', 'Plans', 'Factures', 'Photos', 'Commandes', 'Heure chantier']
});
assert.strictEqual(service.resolveClientOrder('Client', 'Portail').id, 2);
assert.strictEqual(service.resolveClientOrderById(2).description, 'Portail');
assert.strictEqual(service.resolveClientOrder('Client', 'Commande_1').id, 1);
assert.strictEqual(service.resolveClientOrder('Inconnu', 'Portail'), undefined);
assert(service.isSupportedFolderType('Photos'));
assert(!service.isSupportedFolderType('Croquis'));
assert.strictEqual(service.resolveFolderPath('/base', 'Client', 'Portail', 'Plans'), '/base/Client/Portail/Plans');
console.log('OK - service dossiers commandes clients');
