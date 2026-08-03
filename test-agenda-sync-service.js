'use strict';

const assert = require('assert');
const { createAgendaSyncService } = require('./services/agendaSyncService');

const imported = [];
const agendaService = {
  purgeExpiredEventsSafely() {},
  getLocalSyncMin: () => '2026-08-03T00:00',
  getGoogleSyncTimeMin: () => '2026-08-03T00:00:00+02:00',
  listSyncEvents: () => [],
  deleteLinkedEvents() {},
  setGoogleEventId() {},
  updateFromGoogle() {},
  importFromGoogle: (event) => imported.push(event),
};
const normalizedGoogle = { id: 'g1', title: 'Pose', start_date: '2026-08-04T08:00', end_date: '2026-08-04T09:00' };
const googleSync = {
  listGoogleCalendarEvents: async () => ({ items: [{ id: 'g1' }] }),
  planGoogleCancellations: (local, google) => ({ remainingLocalRows: local, activeGoogleRows: google, deleteLocal: [], cancelledGoogleEventIds: new Set() }),
  buildSyncPreview: () => ({ actions: { link: [], importLocal: [{ google: { normalized: normalizedGoogle } }], createGoogle: [], updateLocal: [], updateGoogle: [], ambiguous: [], errors: [], googleDuplicates: [] } }),
  googleRequestBodyFromLocal: () => null,
  isNotFoundGoogleError: () => false,
};
const service = createAgendaSyncService({
  agendaService,
  googleCalendarService: {
    timeZone: 'Europe/Paris', calendarId: 'a2',
    createCalendar: () => ({ events: {} }),
    getCalendarTarget: async () => ({ id: 'a2', summary: 'A2' }),
  },
  googleSync,
  logger: { error() {} },
});

(async () => {
  const result = await service.syncAgenda({ access_token: 'fake' });
  assert.strictEqual(result.status, 'applied');
  assert.strictEqual(imported.length, 1);
  assert.strictEqual(imported[0].id, 'g1');
  assert.match(result.message, /Synchronisation appliquée/);
  console.log('OK - synchronisation Agenda Google');
})().catch((error) => { console.error(error); process.exitCode = 1; });
