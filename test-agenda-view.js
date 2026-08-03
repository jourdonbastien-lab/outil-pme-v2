'use strict';

const assert = require('assert');
const { renderAgendaView } = require('./views/agendaView');
const agendaEventRange = require('./lib/agendaEventRange');
const googleSync = require('./lib/googleCalendarSync');
const dependencies = {
  escHtml: String,
  clientPageIcon: () => '<svg></svg>',
  dateKeyInTimeZone: () => '2026-08-03',
  agendaEventRange,
  googleSync,
  timeZone: 'Europe/Paris',
};
const events = [
  { id: 1, title: 'Journée', type: 'chantier', start_date: '2026-08-03T00:00', end_date: '2026-08-03T23:59' },
  { id: 2, title: 'Multi', type: 'pose', start_date: '2026-08-03T08:00', end_date: '2026-08-05T17:00' },
];
const week = renderAgendaView({ events, requestedView: 'week', requestedMonth: '' }, dependencies);
assert.ok(week.includes('Planning semaine'));
assert.ok(week.includes('action="/google/sync"'));
assert.ok(week.includes("fetch('/agenda/delete'"));
assert.ok(week.includes("id ? '/agenda/update' : '/agenda/add'"));
assert.ok(week.includes('id="event-editor"'));
const month = renderAgendaView({ events, requestedView: 'month', requestedMonth: '2026-08' }, dependencies);
assert.ok(month.includes('Du lundi au vendredi'));
assert.ok(month.includes('↔ Multi'));
assert.ok(month.includes('Mois précédent'));
console.log('OK - vue Agenda général');
