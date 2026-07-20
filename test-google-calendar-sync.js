'use strict';

const assert = require('assert');
const fs = require('fs');
const sync = require('./lib/googleCalendarSync');

function local(overrides = {}) {
  return {
    id: 1,
    title: 'Pose client',
    start_date: '2026-07-13T09:00',
    end_date: '2026-07-13T10:00',
    google_event_id: '',
    ...overrides
  };
}

function google(overrides = {}) {
  return {
    id: 'g1',
    summary: 'Pose client',
    start: { dateTime: '2026-07-13T09:00:00+02:00' },
    end: { dateTime: '2026-07-13T10:00:00+02:00' },
    extendedProperties: { private: {} },
    ...overrides
  };
}

{
  const preview = sync.buildSyncPreview([local({ title: '  POSE   client ' })], [google()], { timeZone: 'Europe/Paris' });
  assert.strictEqual(preview.actions.createGoogle.length, 0, 'identical timed event must not create Google event');
  assert.strictEqual(preview.actions.link.length, 1, 'identical unlinked local event must be linked');
}

{
  const g = google({
    id: 'all-day',
    summary: 'Journee atelier',
    start: { date: '2026-07-13' },
    end: { date: '2026-07-14' }
  });
  const normalized = sync.normalizeGoogleEvent(g);
  assert.strictEqual(normalized.start_date, '2026-07-13T00:00');
  assert.strictEqual(normalized.end_date, '2026-07-13T23:59');
  assert.strictEqual(normalized.dateType, 'date');
}

{
  const preview = sync.buildSyncPreview([local()], [google()], { timeZone: 'Europe/Paris' });
  assert.strictEqual(preview.actions.link.length, 1, 'local event identical to Google must be linked');
  assert.strictEqual(preview.actions.createGoogle.length, 0, 'linked identical event must not be recreated');
}

{
  const preview = sync.buildSyncPreview(
    [local({ google_event_id: 'g1' })],
    [google({ id: 'g1', summary: 'Pose client modifiee' })],
    { timeZone: 'Europe/Paris' }
  );
  assert.strictEqual(preview.actions.updateLocal.length, 1, 'valid google_event_id must update local row');
}

{
  const preview = sync.buildSyncPreview(
    [local({ google_event_id: 'missing-old-id' })],
    [google({ id: 'g2' })],
    { timeZone: 'Europe/Paris' }
  );
  assert.strictEqual(preview.actions.link.length, 1, 'stale google_event_id must recover by canonical key');
  assert.strictEqual(preview.actions.createGoogle.length, 0, 'stale google_event_id recovery must avoid creation when a match exists');
  assert.strictEqual(sync.isNotFoundGoogleError({ response: { status: 404 } }), true, '404 must be recoverable');
}

{
  const preview = sync.buildSyncPreview(
    [local({ id: 1, start_date: '2026-07-13T09:00', end_date: '2026-07-13T10:00' })],
    [google({ id: 'g2', start: { dateTime: '2026-07-13T11:00:00+02:00' }, end: { dateTime: '2026-07-13T12:00:00+02:00' } })],
    { timeZone: 'Europe/Paris' }
  );
  assert.strictEqual(preview.actions.link.length, 0, 'same title with different times must not merge');
  assert.strictEqual(preview.actions.createGoogle.length, 1, 'different timed local event remains distinct');
}

{
  const preview = sync.buildSyncPreview(
    [local()],
    [google({ id: 'g1' }), google({ id: 'g2' })],
    { timeZone: 'Europe/Paris' }
  );
  assert.strictEqual(preview.actions.ambiguous.length, 1, 'multiple Google matches must be ambiguous');
  assert.strictEqual(preview.actions.createGoogle.length, 0, 'ambiguous matches must not write');
}

{
  const first = sync.buildSyncPreview([local()], [google()], { timeZone: 'Europe/Paris' });
  assert.strictEqual(first.actions.link.length, 1);
  const second = sync.buildSyncPreview([local({ google_event_id: 'g1' })], [google()], { timeZone: 'Europe/Paris' });
  assert.strictEqual(second.actions.createGoogle.length, 0, 'second sync must not create anything');
  assert.strictEqual(second.actions.importLocal.length, 0, 'second sync must not import anything');
}

{
  const server = fs.readFileSync('server.js', 'utf8');
  const syncRouteStart = server.indexOf("app.get('/google/sync'");
  const syncRouteEnd = server.indexOf("app.get('/google/calendars'", syncRouteStart);
  const syncRoutes = server.slice(syncRouteStart, syncRouteEnd);
  assert.ok(syncRoutes.includes('googleSyncLocked'), 'sync routes must use the concurrency lock');
  assert.ok(syncRoutes.includes('DELETE FROM events WHERE id = ? AND google_event_id = ?'), 'only the exact linked row may be deleted');
}

async function runDeletionTests() {
  {
    const plan = sync.planGoogleCancellations([local({ id: 11, google_event_id: 'deleted-g11' })], [{ id: 'deleted-g11', status: 'cancelled' }]);
    assert.deepStrictEqual(plan.deleteLocal.map((row) => row.id), [11], 'linked cancelled event must be deleted locally');
    assert.strictEqual(plan.remainingLocalRows.length, 0);
  }

  {
    const plan = sync.planGoogleCancellations([local({ id: 12, google_event_id: '' })], [{ id: '12', status: 'cancelled' }]);
    assert.strictEqual(plan.deleteLocal.length, 0, 'unlinked local event must be kept');
    assert.deepStrictEqual(plan.remainingLocalRows.map((row) => row.id), [12]);
  }

  {
    const plan = sync.planGoogleCancellations([local({ id: 13, google_event_id: 'deleted-g13' })], [{ id: 'deleted-g13', status: 'cancelled' }]);
    const preview = sync.buildSyncPreview(plan.remainingLocalRows, plan.activeGoogleRows, { timeZone: 'Europe/Paris' });
    assert.strictEqual(preview.actions.createGoogle.length, 0, 'cancelled event must not be recreated in the same sync');
    assert.strictEqual(plan.cancelledGoogleEventIds.has('deleted-g13'), true);
  }

  {
    const calls = [];
    const calendar = { events: { list: async (params) => {
      calls.push(params);
      return calls.length === 1
        ? { data: { items: [google({ id: 'page-1' })], nextPageToken: 'page-2' } }
        : { data: { items: [{ id: 'deleted-page-2', status: 'cancelled' }], nextSyncToken: 'next-token' } };
    } } };
    const result = await sync.listGoogleCalendarEvents(calendar, 'calendar-id', { timeMin: '2026-07-13T00:00:00+02:00' });
    assert.strictEqual(result.items.length, 2, 'all pages must be collected');
    assert.strictEqual(result.nextSyncToken, 'next-token');
    assert.strictEqual(calls[0].showDeleted, true);
    assert.strictEqual(calls[1].pageToken, 'page-2');
  }

  {
    let calls = 0;
    let deletionsApplied = 0;
    const calendar = { events: { list: async () => {
      calls += 1;
      if (calls === 1) return { data: { items: [{ id: 'cancelled-first-page', status: 'cancelled' }], nextPageToken: 'next' } };
      throw new Error('Google page failure');
    } } };
    try {
      const result = await sync.listGoogleCalendarEvents(calendar, 'calendar-id', { timeMin: '2026-07-13T00:00:00+02:00' });
      deletionsApplied += sync.planGoogleCancellations([local({ google_event_id: 'cancelled-first-page' })], result.items).deleteLocal.length;
      assert.fail('pagination failure must reject');
    } catch (err) {
      assert.strictEqual(err.message, 'Google page failure');
    }
    assert.strictEqual(deletionsApplied, 0, 'partial Google response must not delete locally');
  }

  {
    const calls = [];
    const calendar = { events: { list: async (params) => {
      calls.push(params);
      if (params.syncToken) throw { response: { status: 410 } };
      return { data: { items: [google({ id: 'full-sync' })], nextSyncToken: 'fresh-token' } };
    } } };
    const result = await sync.listGoogleCalendarEvents(calendar, 'calendar-id', {
      syncToken: 'expired-token',
      timeMin: '2026-07-13T00:00:00+02:00'
    });
    assert.strictEqual(result.restartedAfter410, true, '410 must trigger a safe full sync');
    assert.strictEqual(result.nextSyncToken, 'fresh-token');
    assert.strictEqual(calls[1].syncToken, undefined);
    assert.strictEqual(calls[1].timeMin, '2026-07-13T00:00:00+02:00');
  }

  {
    const series = local({ id: 20, google_event_id: 'series-id' });
    const occurrence = local({ id: 21, google_event_id: 'series-id_20260720T070000Z' });
    const plan = sync.planGoogleCancellations([series, occurrence], [{ id: 'series-id_20260720T070000Z', recurringEventId: 'series-id', status: 'cancelled' }]);
    assert.deepStrictEqual(plan.deleteLocal.map((row) => row.id), [21], 'only cancelled occurrence must be deleted');
    assert.deepStrictEqual(plan.remainingLocalRows.map((row) => row.id), [20]);
  }

  {
    const plan = sync.planGoogleCancellations([local({ id: 30, google_event_id: 'g1' })], [google({ id: 'g1' })]);
    const preview = sync.buildSyncPreview(plan.remainingLocalRows, plan.activeGoogleRows, { timeZone: 'Europe/Paris' });
    assert.strictEqual(plan.deleteLocal.length, 0, 'normal sync must not delete');
    assert.strictEqual(preview.actions.updateLocal.length, 1);
    assert.strictEqual(preview.actions.createGoogle.length, 0);
  }
}

runDeletionTests()
  .then(() => console.log('google calendar sync tests ok'))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
