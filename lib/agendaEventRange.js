'use strict';

const googleSync = require('./googleCalendarSync');

const DEFAULT_TIME_ZONE = 'Europe/Paris';

function agendaDateTime(value, timeZone = DEFAULT_TIME_ZONE) {
  const normalized = googleSync.normalizeAgendaDateTime(value, timeZone);
  if (!normalized) return null;
  const date = new Date(`${normalized}:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function agendaEventEnd(event, timeZone = DEFAULT_TIME_ZONE) {
  const start = agendaDateTime(event?.start_date, timeZone);
  if (!start) return null;
  const end = agendaDateTime(event?.end_date, timeZone);
  if (end && end >= start) return end;
  const fallback = new Date(start);
  fallback.setHours(fallback.getHours() + 1);
  return fallback;
}

function eventOverlapsDay(event, dayStart, dayEnd, timeZone = DEFAULT_TIME_ZONE) {
  const start = agendaDateTime(event?.start_date, timeZone);
  const end = agendaEventEnd(event, timeZone);
  if (!start || !end || !(dayStart instanceof Date) || !(dayEnd instanceof Date)) return false;

  // dayEnd is the exclusive midnight boundary. This is equivalent to
  // start <= end-of-day AND end >= start-of-day, without adding the next day.
  return start < dayEnd && end >= dayStart;
}

module.exports = {
  DEFAULT_TIME_ZONE,
  agendaDateTime,
  agendaEventEnd,
  eventOverlapsDay
};
