'use strict';
const assert = require('assert');
const { createClientOrderService } = require('./services/clientOrderService');
assert.throws(() => createClientOrderService({}), /Base de données/);
const calls = [];
const db = {
  prepare(sql) { return {
    all: (...args) => { calls.push({ sql, args }); return []; },
    get: (...args) => { calls.push({ sql, args }); return { id: 1 }; },
    run: (...args) => { calls.push({ sql, args }); return { changes: 1, lastInsertRowid: 8 }; }
  }; },
  transaction(fn) { return () => fn(); }
};
const service = createClientOrderService({ db, now: () => 'NOW' });
service.listActiveOrders();
assert(calls.at(-1).sql.includes("status != 'Terminée'"));
service.listAllOrdersNewestFirst();
assert(calls.at(-1).sql.includes('ORDER BY id DESC'));
service.listHoursTotals();
assert(calls.at(-1).sql.includes('GROUP BY client_order_id, client, order_name'));
service.createOrder({ name: 'C', description: 'O', date: '2026-01-01', price: 100, vatRate: 20,
  plannedHours: 2, chantierStatus: 'À préparer', startDate: null, endDate: null, quoteId: null });
assert(calls.at(-1).sql.includes('INSERT INTO client_orders'));
service.completeOrder(8);
assert(calls.at(-1).sql.includes("status = 'Terminée'"));
console.log('OK - service commandes clients');
