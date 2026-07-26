'use strict';
const assert = require('assert');
const { createClientOrderHoursService } = require('./services/clientOrderHoursService');
assert.throws(() => createClientOrderHoursService({}), /Base de données/);
const calls = [];
const db = { prepare(sql) {
  return {
    get(...args) { calls.push({ sql, args }); return sql.includes('client_orders') ? { id: 7 } : { m: 90 }; },
    all(...args) { calls.push({ sql, args }); return [{ id: 1, minutes_total: 60 }]; },
    run(...args) { calls.push({ sql, args }); return { changes: 1 }; }
  };
}};
const service = createClientOrderHoursService({ db, now: () => 'NOW' });
assert.strictEqual(service.resolveOrderId(7), 7);
service.listHoursForOrder({ orderId: 7, client: 'Client', order: 'Portail' });
assert(calls.at(-1).sql.includes('client_order_id = ?'));
assert(calls.at(-1).sql.includes('client_order_id IS NULL'));
assert.deepStrictEqual(calls.at(-1).args, [7, 'Client', 'Portail']);
service.listHoursForOrder({ orderId: null, client: 'Client', order: 'Portail' });
assert(!calls.at(-1).sql.includes('client_order_id = ?'));
assert.strictEqual(service.sumHoursSince({ orderId: 7, client: 'Client', order: 'Portail', since: '2026-01-01' }), 90);
service.createHourEntry({ client: 'Client', order: 'Portail', orderId: 7, workDate: '2026-01-02', minutesTotal: 75, note: '', category: 'pose' });
assert(calls.at(-1).sql.includes('INSERT INTO chantier_hours'));
assert(calls.at(-1).args.includes(75));
service.deleteHourEntry(1);
assert.deepStrictEqual(calls.at(-1).args, [1]);
console.log('OK - service heures commandes');
