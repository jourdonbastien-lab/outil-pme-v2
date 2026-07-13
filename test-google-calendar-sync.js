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
  assert.ok(!syncRoutes.includes('DELETE FROM events'), 'sync routes must not delete local events');
}

console.log('google calendar sync tests ok');
