'use strict';

process.env.TZ = 'Europe/Paris';

const assert = require('assert');
const googleSync = require('./lib/googleCalendarSync');
const { eventOverlapsDay } = require('./lib/agendaEventRange');

function day(value) {
  return new Date(`${value}T00:00:00`);
}

function visibleOn(event, date) {
  const start = day(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return eventOverlapsDay(event, start, end, 'Europe/Paris');
}

// 1. Evénement d'un jour.
{
  const event = { start_date: '2026-07-13T09:00', end_date: '2026-07-13T10:00' };
  assert.strictEqual(visibleOn(event, '2026-07-13'), true);
  assert.strictEqual(visibleOn(event, '2026-07-14'), false);
}

// 2. Evénement de trois jours dans la même semaine.
{
  const event = { start_date: '2026-07-13T09:00', end_date: '2026-07-15T18:00' };
  assert.deepStrictEqual(
    ['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16'].map((date) => visibleOn(event, date)),
    [true, true, true, false]
  );
}

// 3. Evénement commençant la semaine précédente.
{
  const event = { start_date: '2026-07-10T14:00', end_date: '2026-07-14T12:00' };
  assert.deepStrictEqual(
    ['2026-07-13', '2026-07-14', '2026-07-15'].map((date) => visibleOn(event, date)),
    [true, true, false]
  );
}

// 4. Evénement finissant la semaine suivante.
{
  const event = { start_date: '2026-07-17T08:00', end_date: '2026-07-21T17:00' };
  assert.deepStrictEqual(
    ['2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19'].map((date) => visibleOn(event, date)),
    [false, true, true, true]
  );
}

// 5. All-day Google : la fin exclusive est normalisée sans jour supplémentaire.
{
  const event = googleSync.normalizeGoogleEvent({
    id: 'google-all-day',
    summary: 'Formation',
    start: { date: '2026-07-13' },
    end: { date: '2026-07-16' }
  }, { timeZone: 'Europe/Paris' });
  assert.strictEqual(event.end_date, '2026-07-15T23:59');
  assert.deepStrictEqual(
    ['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16'].map((date) => visibleOn(event, date)),
    [true, true, true, false]
  );
}

// 6. Evénement avec heures de début et de fin, y compris à cheval sur minuit.
{
  const event = { start_date: '2026-07-13T22:30', end_date: '2026-07-14T01:15' };
  assert.deepStrictEqual(
    ['2026-07-13', '2026-07-14', '2026-07-15'].map((date) => visibleOn(event, date)),
    [true, true, false]
  );
}

console.log('agenda event range tests ok');
