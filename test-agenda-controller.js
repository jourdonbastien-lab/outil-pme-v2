'use strict';

const assert = require('assert');
const { createAgendaController } = require('./controllers/agendaController');

const calls = [];
const controller = createAgendaController({
  agendaService: {
    purgeExpiredEventsSafely: () => calls.push('purge'), listEvents: () => [],
    createEvent: (body) => calls.push(['create', body]), updateEvent: (body) => calls.push(['update', body]),
    getEventById: () => undefined, deleteEvent: (id) => calls.push(['delete', id]),
  },
  googleCalendarService: {}, renderAgendaView: () => 'AGENDA',
  pageTemplate: (req, title, html) => `${title}:${html}`, viewDependencies: {},
});
const response = () => ({ send(value) { this.body = value; return this; }, json(value) { this.jsonBody = value; return this; } });
let res = response();
controller.showAgenda({ query: {} }, res);
assert.strictEqual(res.body, 'Agenda:AGENDA');
res = response(); controller.createEvent({ body: { title: 'A' } }, res); assert.deepStrictEqual(res.jsonBody, { success: true });
res = response(); controller.updateEvent({ body: { id: 1 } }, res); assert.deepStrictEqual(res.jsonBody, { success: true });
(async () => {
  res = response(); await controller.deleteEvent({ body: { id: 1 }, session: {} }, res);
  assert.deepStrictEqual(res.jsonBody, { success: true });
  assert.ok(calls.some((call) => Array.isArray(call) && call[0] === 'delete'));
  console.log('OK - contrôleur Agenda général');
})().catch((error) => { console.error(error); process.exitCode = 1; });
