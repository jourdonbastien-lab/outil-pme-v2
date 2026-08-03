'use strict';

const assert = require('assert');
const { renderAgendaEventCard, renderMonthAgendaEventCard } = require('./views/agendaEventCardView');
const escHtml = (value) => String(value).replaceAll('<', '&lt;');
const event = { id: 7, title: '<Pose>', type: 'pose', start_date: '2026-08-03T08:00', end_date: '2026-08-04T17:00' };
const html = renderAgendaEventCard(event, { escHtml, formatAgendaTime: (value) => value.slice(11) });
assert.ok(html.includes('data-event-id="7"'));
assert.ok(html.includes('&lt;Pose>'));
assert.ok(html.includes('08:00 - 17:00'));
const monthHtml = renderMonthAgendaEventCard(event, new Date(2026, 7, 3), {
  escHtml,
  localDateTime: (value) => new Date(`${value}:00`),
  eventEndDate: () => new Date('2026-08-04T17:00:00'),
  isAllDayAgendaEvent: () => false,
});
assert.ok(monthHtml.includes('↔ '));
assert.ok(monthHtml.includes('planning-month-event'));
console.log('OK - carte événement Agenda');
