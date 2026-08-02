'use strict';
const assert = require('assert');
const Database = require('better-sqlite3');
const { createSupplierOrdersService } = require('./services/supplierOrdersService');
const db = new Database(':memory:');
db.exec(`
  CREATE TABLE supplier_orders (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, date TEXT NOT NULL, status TEXT DEFAULT 'En cours', created_at TEXT);
  CREATE TABLE client_orders (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT);
  CREATE TABLE client_order_purchases (id INTEGER PRIMARY KEY, client_order_id INTEGER NOT NULL, designation TEXT NOT NULL, category TEXT, qty REAL, unit TEXT, reference TEXT, supplier TEXT, needed_date TEXT, status TEXT, updated_at TEXT);
`);
db.prepare("INSERT INTO supplier_orders VALUES (1, 'Acier & Fils', 'Tubes', '2026-08-01', 'En cours', 'OLD')").run();
db.prepare("INSERT INTO supplier_orders VALUES (2, 'Zinc', NULL, '2026-07-01', 'Terminée', 'OLD')").run();
db.prepare("INSERT INTO client_orders VALUES (4, 'Client Été', 'Portail')").run();
db.prepare("INSERT INTO client_order_purchases VALUES (8, 4, 'Moteur', 'Motorisation', 2, 'u', 'REF', '', '2026-08-10', 'À commander', NULL)").run();
const normalizeSearchText = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const normalizePurchaseStatus = (value) => ['À commander', 'Commandé', 'Reçu'].includes(value) ? value : 'À commander';
const service = createSupplierOrdersService({ db, normalizeSearchText, normalizePurchaseStatus,
  clientOrderFolderName: (order) => order.description || `Commande_${order.id}`,
  safeName: (value) => String(value), formatDateLabel: (value) => value,
  isoDate: () => '2026-08-02', now: () => 'NOW' });
let data = service.listSupplierOrders({});
assert.deepStrictEqual(data.orders.map((order) => order.id), [1, 2]);
assert.strictEqual(data.activeCount, 1);
assert.deepStrictEqual(data.combinedSupplierItems.map((item) => item.key), ['purchase-8', 'supplier-1', 'supplier-2']);
assert(data.combinedSupplierItems[0].href.includes('Client%20%C3%89t%C3%A9/Portail/Commandes'));
assert(data.supplierChoices.includes(''));
data = service.listSupplierOrders({ status: 'done' });
assert.deepStrictEqual(data.combinedSupplierItems.map((item) => item.key), ['supplier-2']);
data = service.listSupplierOrders({ supplier: '__missing', q: 'moteur' });
assert.deepStrictEqual(data.combinedSupplierItems.map((item) => item.key), ['purchase-8']);
const created = service.createSupplierOrder({ name: ' Nouveau ', description: '', date: '' });
assert.strictEqual(Number(created.lastInsertRowid), 3);
assert.deepStrictEqual(db.prepare('SELECT name, description, date, status, created_at FROM supplier_orders WHERE id = 3').get(), {
  name: 'Nouveau', description: null, date: '2026-08-02', status: 'En cours', created_at: 'NOW'
});
assert.strictEqual(service.updatePurchaseStatus(999, 'Reçu'), null);
assert.strictEqual(service.updatePurchaseStatus(8, 'Commandé'), true);
assert.deepStrictEqual(db.prepare('SELECT status, updated_at FROM client_order_purchases WHERE id = 8').get(), { status: 'Commandé', updated_at: 'NOW' });
service.completeSupplierOrder(1);
assert.strictEqual(db.prepare('SELECT status FROM supplier_orders WHERE id = 1').get().status, 'Terminée');
service.deleteSupplierOrder(2);
assert.strictEqual(db.prepare('SELECT id FROM supplier_orders WHERE id = 2').get(), undefined);
db.close();
console.log('OK - service commandes fournisseurs');
