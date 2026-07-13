'use strict';

const DEFAULT_TIME_ZONE = 'Europe/Paris';
const PRIVATE_EVENT_ID_KEY = 'outilPmeEventId';

function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('fr-FR');
}

function dateOnly(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function addDaysToDateOnly(value, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return '';
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDateTimeInZone(date, timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}T${byType.hour}:${byType.minute}`;
}

function normalizeAgendaDateTime(value, timeZone = DEFAULT_TIME_ZONE) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00`;
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  if (direct && !/[zZ]$/.test(raw)) return direct[1];

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return formatDateTimeInZone(date, timeZone);
}

function isLocalAllDayShape(startDate, endDate) {
  return Boolean(
    startDate &&
    endDate &&
    startDate.slice(11, 16) === '00:00' &&
    endDate.slice(11, 16) === '23:59'
  );
}

function canonicalKeyFromParts(parts) {
  return [
    parts.dateType,
    normalizeTitle(parts.title),
    parts.start,
    parts.end
  ].join('|');
}

function normalizeLocalEvent(event, options = {}) {
  const timeZone = options.timeZone || DEFAULT_TIME_ZONE;
  const startDate = normalizeAgendaDateTime(event?.start_date, timeZone);
  let endDate = normalizeAgendaDateTime(event?.end_date, timeZone);

  if (!startDate) return null;
  if (!endDate || endDate <= startDate) {
    const fallback = new Date(`${startDate}:00`);
    fallback.setHours(fallback.getHours() + 1);
    endDate = formatDateTimeInZone(fallback, timeZone);
  }

  const dateType = isLocalAllDayShape(startDate, endDate) ? 'date' : 'dateTime';
  const start = dateType === 'date' ? dateOnly(startDate) : startDate;
  const end = dateType === 'date' ? dateOnly(endDate) : endDate;
  const title = String(event?.title || 'Sans titre').trim() || 'Sans titre';

  return {
    source: 'local',
    id: event?.id == null ? null : String(event.id),
    rawId: event?.id,
    googleEventId: String(event?.google_event_id || '').trim(),
    title,
    normalizedTitle: normalizeTitle(title),
    start_date: dateType === 'date' ? `${start}T00:00` : startDate,
    end_date: dateType === 'date' ? `${end}T23:59` : endDate,
    dateType,
    start,
    end,
    key: canonicalKeyFromParts({ dateType, title, start, end })
  };
}

function googlePrivateOutilPmeEventId(googleEvent) {
  return String(googleEvent?.extendedProperties?.private?.[PRIVATE_EVENT_ID_KEY] || '').trim();
}

function normalizeGoogleEvent(googleEvent, options = {}) {
  if (!googleEvent || googleEvent.status === 'cancelled') return null;
  const timeZone = options.timeZone || DEFAULT_TIME_ZONE;
  const title = String(googleEvent.summary || 'Sans titre').trim() || 'Sans titre';

  if (googleEvent.start?.date) {
    const start = googleEvent.start.date;
    const exclusiveEnd = googleEvent.end?.date || addDaysToDateOnly(start, 1);
    const inclusiveEnd = addDaysToDateOnly(exclusiveEnd, -1) || start;
    const end = inclusiveEnd < start ? start : inclusiveEnd;
    return {
      source: 'google',
      id: String(googleEvent.id || ''),
      title,
      normalizedTitle: normalizeTitle(title),
      start_date: `${start}T00:00`,
      end_date: `${end}T23:59`,
      dateType: 'date',
      start,
      end,
      outilPmeEventId: googlePrivateOutilPmeEventId(googleEvent),
      key: canonicalKeyFromParts({ dateType: 'date', title, start, end })
    };
  }

  const start = normalizeAgendaDateTime(googleEvent.start?.dateTime, timeZone);
  if (!start) return null;
  let end = normalizeAgendaDateTime(googleEvent.end?.dateTime, timeZone);
  if (!end || end <= start) {
    const fallback = new Date(`${start}:00`);
    fallback.setHours(fallback.getHours() + 1);
    end = formatDateTimeInZone(fallback, timeZone);
  }

  return {
    source: 'google',
    id: String(googleEvent.id || ''),
    title,
    normalizedTitle: normalizeTitle(title),
    start_date: start,
    end_date: end,
    dateType: 'dateTime',
    start,
    end,
    outilPmeEventId: googlePrivateOutilPmeEventId(googleEvent),
    key: canonicalKeyFromParts({ dateType: 'dateTime', title, start, end })
  };
}

function googleRequestBodyFromLocal(event, options = {}) {
  const normalized = normalizeLocalEvent(event, options);
  if (!normalized) return null;

  const body = {
    summary: normalized.title,
    extendedProperties: {
      private: {
        [PRIVATE_EVENT_ID_KEY]: String(event.id)
      }
    }
  };

  if (normalized.dateType === 'date') {
    body.start = { date: normalized.start };
    body.end = { date: addDaysToDateOnly(normalized.end, 1) };
  } else {
    body.start = {
      dateTime: `${normalized.start}:00`,
      timeZone: options.timeZone || DEFAULT_TIME_ZONE
    };
    body.end = {
      dateTime: `${normalized.end}:00`,
      timeZone: options.timeZone || DEFAULT_TIME_ZONE
    };
  }

  return body;
}

function findUniqueByIndex(index, key) {
  const list = index.get(String(key || '')) || [];
  if (list.length === 1) return { match: list[0], ambiguous: false };
  if (list.length > 1) return { match: null, ambiguous: true, candidates: list };
  return { match: null, ambiguous: false };
}

function buildIndex(items, keySelector) {
  const index = new Map();
  for (const item of items) {
    const key = keySelector(item);
    if (!key) continue;
    const list = index.get(key) || [];
    list.push(item);
    index.set(key, list);
  }
  return index;
}

function buildSyncPreview(localRows, googleRows, options = {}) {
  const local = localRows.map((row) => ({ row, normalized: normalizeLocalEvent(row, options) })).filter((item) => item.normalized);
  const google = googleRows.map((row) => ({ row, normalized: normalizeGoogleEvent(row, options) })).filter((item) => item.normalized && item.normalized.id);

  const localByGoogleId = buildIndex(local, (item) => item.normalized.googleEventId);
  const localById = buildIndex(local, (item) => item.normalized.id);
  const localByKey = buildIndex(local, (item) => item.normalized.key);
  const googleById = buildIndex(google, (item) => item.normalized.id);
  const googleByPrivateId = buildIndex(google, (item) => item.normalized.outilPmeEventId);
  const googleByKey = buildIndex(google, (item) => item.normalized.key);

  const matchedLocalIds = new Set();
  const matchedGoogleIds = new Set();
  const reportedAmbiguousGoogleKeys = new Set();
  const actions = {
    link: [],
    importLocal: [],
    createGoogle: [],
    updateLocal: [],
    updateGoogle: [],
    ambiguous: [],
    errors: [],
    googleDuplicates: []
  };

  for (const item of google) {
    const g = item.normalized;

    if ((googleByKey.get(g.key) || []).length > 1 && (localByKey.get(g.key) || []).length > 0) {
      if (!reportedAmbiguousGoogleKeys.has(g.key)) {
        actions.ambiguous.push({
          side: 'google',
          reason: 'canonical_key',
          google: item,
          candidates: googleByKey.get(g.key) || []
        });
        reportedAmbiguousGoogleKeys.add(g.key);
      }
      continue;
    }

    let found = findUniqueByIndex(localByGoogleId, g.id);
    let reason = 'google_event_id';

    if (!found.match && !found.ambiguous && g.outilPmeEventId) {
      found = findUniqueByIndex(localById, g.outilPmeEventId);
      reason = 'outilPmeEventId';
    }
    if (!found.match && !found.ambiguous) {
      found = findUniqueByIndex(localByKey, g.key);
      reason = 'canonical_key';
    }

    if (found.ambiguous) {
      actions.ambiguous.push({ side: 'google', reason, google: item, candidates: found.candidates || [] });
      continue;
    }

    if (found.match) {
      matchedLocalIds.add(String(found.match.normalized.rawId));
      matchedGoogleIds.add(g.id);
      if (found.match.normalized.googleEventId !== g.id) {
        actions.link.push({ local: found.match, google: item, reason });
      }
      actions.updateLocal.push({ local: found.match, google: item, reason });
    } else {
      actions.importLocal.push({ google: item });
      matchedGoogleIds.add(g.id);
    }
  }

  for (const item of local) {
    const l = item.normalized;
    if (matchedLocalIds.has(String(l.rawId))) continue;

    if ((googleByKey.get(l.key) || []).length > 1) {
      if (!reportedAmbiguousGoogleKeys.has(l.key)) {
        actions.ambiguous.push({
          side: 'local',
          reason: 'canonical_key',
          local: item,
          candidates: googleByKey.get(l.key) || []
        });
        reportedAmbiguousGoogleKeys.add(l.key);
      }
      continue;
    }

    let found = l.googleEventId ? findUniqueByIndex(googleById, l.googleEventId) : { match: null, ambiguous: false };
    let reason = 'google_event_id';
    if (!found.match && !found.ambiguous) {
      found = findUniqueByIndex(googleByPrivateId, l.id);
      reason = 'outilPmeEventId';
    }
    if (!found.match && !found.ambiguous) {
      found = findUniqueByIndex(googleByKey, l.key);
      reason = 'canonical_key';
    }

    if (found.ambiguous) {
      actions.ambiguous.push({ side: 'local', reason, local: item, candidates: found.candidates || [] });
      continue;
    }

    if (found.match) {
      matchedGoogleIds.add(found.match.normalized.id);
      if (l.googleEventId !== found.match.normalized.id) {
        actions.link.push({ local: item, google: found.match, reason });
      }
      actions.updateGoogle.push({ local: item, google: found.match, reason });
    } else {
      actions.createGoogle.push({ local: item });
    }
  }

  for (const [key, list] of googleByKey.entries()) {
    if (list.length > 1) actions.googleDuplicates.push({ key, events: list });
  }

  return { local, google, actions };
}

function isNotFoundGoogleError(err) {
  const status = err?.response?.status || err?.code;
  return status === 404 || status === 410 || status === '404' || status === '410';
}

module.exports = {
  PRIVATE_EVENT_ID_KEY,
  normalizeTitle,
  dateOnly,
  addDaysToDateOnly,
  formatDateTimeInZone,
  normalizeAgendaDateTime,
  normalizeLocalEvent,
  normalizeGoogleEvent,
  googleRequestBodyFromLocal,
  buildSyncPreview,
  isNotFoundGoogleError
};
