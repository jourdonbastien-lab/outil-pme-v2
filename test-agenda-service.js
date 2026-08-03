'use strict';

const assert = require('assert');
const Database = require('better-sqlite3');
const googleSync = require('./lib/googleCalendarSync');
const { createAgendaService } = require('./services/agendaService');

const db = new Database(':memory:');
db.exec(`CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  start_date TEXT,
  end_date TEXT,
  google_event_id TEXT NULL,
  created_at TEXT,
  type TEXT
)`);
const fixedNow = new Date('2026-08-03T10:00:00.000Z');
const service = createAgendaService({
  db,
  googleSync,
  dateKeyInTimeZone: () => '2026-08-03',
  now: () => new Date(fixedNow),
  logger: { log() {}, error() {} },
});

assert.deepStrictEqual(service.listEvents(), []);
const created = service.createEvent({ title: 'Pose', type: '', start_date: '2026-08-04T08:00', end_date: '2026-08-04T09:00' });
assert.ok(created.lastInsertRowid);
assert.strictEqual(service.getEventById(created.lastInsertRowid).type, 'rdv');
service.updateEvent({ id: created.lastInsertRowid, title: 'Pose modifiée', type: 'pose', start_date: '2026-08-04T08:00', end_date: '2026-08-05T17:00' });
assert.strictEqual(service.getEventById(created.lastInsertRowid).title, 'Pose modifiée');
assert.strictEqual(service.listSyncEvents('2026-08-03T00:00').length, 1);
assert.strictEqual(service.getLocalSyncMin(), '2026-08-03T00:00');
assert.match(service.getGoogleSyncTimeMin(), /^2026-08-03T00:00:00\+02:00$/);

service.createEvent({ title: 'Ancien', type: 'rdv', start_date: '2026-08-01T08:00', end_date: '2026-08-01T09:00' });
assert.strictEqual(service.purgeExpiredEvents(), 1);
assert.strictEqual(service.listEvents().length, 1);
service.setGoogleEventId('google-1', created.lastInsertRowid);
assert.strictEqual(service.getEventById(created.lastInsertRowid).google_event_id, 'google-1');
service.deleteEvent(created.lastInsertRowid);
assert.strictEqual(service.getEventById(created.lastInsertRowid), undefined);
db.close();
console.log('OK - service Agenda général');
