'use strict';
const assert = require('assert');
const { createClientOrderAgendaService } = require('./services/clientOrderAgendaService');
assert.throws(() => createClientOrderAgendaService({}), /Base de données/);
const calls = [];
const db = { prepare: (sql) => ({
  get: (...args) => { calls.push({ sql, args }); return sql.includes('client_orders') ? { id: 5 } : undefined; },
  run: (...args) => { calls.push({ sql, args }); return { changes: 1 }; }
}) };
const service = createClientOrderAgendaService({ db, normalizeChantierStatus: (v) => v, now: () => 'NOW' });
assert.deepStrictEqual(service.preparePoseEvent({ id: 5, name: 'C', description: 'P', chantier_status: 'Préparation' }, {}), { error: 'status' });
const event = service.preparePoseEvent({ id: 5, name: 'C', description: 'P', chantier_status: 'En pose' },
  { pose_date: '2026-07-27', start_time: '08:00', end_time: '10:00', place: 'Rue', note: 'Équipe' });
assert.strictEqual(event.title, 'Pose - C - P · Lieu: Rue · Note: Équipe');
service.findDuplicate(event);
assert(calls.at(-1).sql.includes("type = 'pose'"));
service.createPoseEvent(event);
assert(calls.at(-1).args.includes('NOW'));
console.log('OK - service agenda commande');
