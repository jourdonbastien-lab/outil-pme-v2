'use strict';

function createAgendaService({
  db,
  googleSync,
  dateKeyInTimeZone,
  timeZone = 'Europe/Paris',
  now = () => new Date(),
  logger = console,
} = {}) {
  if (!db) throw new TypeError('Base de données Agenda manquante.');

  function listEvents() {
    return db.prepare(`
      SELECT *
      FROM events
      ORDER BY start_date ASC
    `).all();
  }

  function listSyncEvents(syncMin) {
    return db.prepare(`
      SELECT *
      FROM events
      WHERE start_date IS NOT NULL
        AND COALESCE(NULLIF(end_date, ''), start_date) >= ?
      ORDER BY start_date ASC, id ASC
    `).all(syncMin);
  }

  function getEventById(id) {
    return db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  }

  function createEvent({ title, type, start_date, end_date }) {
    return db.prepare(`
      INSERT INTO events (title, type, start_date, end_date, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(title, type || 'rdv', start_date, end_date, now().toISOString());
  }

  function updateEvent({ id, title, type, start_date, end_date }) {
    return db.prepare(`
      UPDATE events
      SET title = ?, type = ?, start_date = ?, end_date = ?
      WHERE id = ?
    `).run(title, type, start_date, end_date, id);
  }

  function deleteEvent(id) {
    return db.prepare('DELETE FROM events WHERE id = ?').run(id);
  }

  function deleteLinkedEvent(id, googleEventId) {
    return db.prepare('DELETE FROM events WHERE id = ? AND google_event_id = ?').run(id, googleEventId);
  }

  function deleteLinkedEvents(events) {
    const statement = db.prepare('DELETE FROM events WHERE id = ? AND google_event_id = ?');
    return db.transaction((items) => {
      for (const item of items) statement.run(item.id, String(item.google_event_id || '').trim());
    })(events);
  }

  function setGoogleEventId(googleEventId, id) {
    return db.prepare('UPDATE events SET google_event_id = ? WHERE id = ?').run(googleEventId, id);
  }

  function updateFromGoogle(googleEvent, localEvent) {
    return db.prepare(`
      UPDATE events
      SET title = ?, start_date = ?, end_date = ?, type = ?, google_event_id = ?
      WHERE id = ?
    `).run(
      googleEvent.title,
      googleEvent.start_date,
      googleEvent.end_date,
      localEvent.type || 'chantier',
      googleEvent.id,
      localEvent.id
    );
  }

  function importFromGoogle(googleEvent) {
    return db.prepare(`
      INSERT INTO events (title, start_date, end_date, google_event_id, type, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      googleEvent.title,
      googleEvent.start_date,
      googleEvent.end_date,
      googleEvent.id,
      'chantier',
      now().toISOString()
    );
  }

  function localAgendaDateKey(value) {
    const normalized = googleSync.normalizeAgendaDateTime(value, timeZone);
    return normalized ? normalized.slice(0, 10) : '';
  }

  function timeZoneOffsetForGoogleTimeMin(date = now(), selectedTimeZone = timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: selectedTimeZone,
      timeZoneName: 'shortOffset',
    }).formatToParts(date);
    const offsetName = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT+1';
    const match = offsetName.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
    if (!match) return '+01:00';
    const sign = match[1];
    const hours = String(match[2]).padStart(2, '0');
    const minutes = String(match[3] || '00').padStart(2, '0');
    return `${sign}${hours}:${minutes}`;
  }

  function getLocalSyncMin() {
    return `${dateKeyInTimeZone(now(), timeZone)}T00:00`;
  }

  function getGoogleSyncTimeMin() {
    const today = dateKeyInTimeZone(now(), timeZone);
    const offset = timeZoneOffsetForGoogleTimeMin(new Date(`${today}T12:00:00Z`), timeZone);
    return `${today}T00:00:00${offset}`;
  }

  function purgeExpiredEvents() {
    const today = dateKeyInTimeZone(now(), timeZone);
    const expiredIds = db.prepare('SELECT id, start_date, end_date FROM events').all()
      .filter((event) => {
        const lastVisibleDate = localAgendaDateKey(event.end_date) || localAgendaDateKey(event.start_date);
        return lastVisibleDate && lastVisibleDate < today;
      })
      .map((event) => event.id);

    if (!expiredIds.length) return 0;
    const statement = db.prepare('DELETE FROM events WHERE id = ?');
    db.transaction((ids) => {
      for (const id of ids) statement.run(id);
    })(expiredIds);
    logger.log(`Agenda: ${expiredIds.length} événement(s) passé(s) supprimé(s) localement.`);
    return expiredIds.length;
  }

  function purgeExpiredEventsSafely() {
    try {
      return purgeExpiredEvents();
    } catch (error) {
      logger.error('Erreur purge automatique agenda local :', error);
      return 0;
    }
  }

  return {
    listEvents,
    listSyncEvents,
    getEventById,
    createEvent,
    updateEvent,
    deleteEvent,
    deleteLinkedEvent,
    deleteLinkedEvents,
    setGoogleEventId,
    updateFromGoogle,
    importFromGoogle,
    getLocalSyncMin,
    getGoogleSyncTimeMin,
    purgeExpiredEvents,
    purgeExpiredEventsSafely,
  };
}

module.exports = { createAgendaService };
