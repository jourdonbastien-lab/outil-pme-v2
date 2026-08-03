'use strict';

const assert = require('assert');
const { registerAgendaPageRoute, registerAgendaMutationRoutes } = require('./routes/agenda');
const calls = [];
const app = { get: (...args) => calls.push(['GET', ...args]), post: (...args) => calls.push(['POST', ...args]) };
const requireLogin = () => {};
const controller = { showAgenda() {}, createEvent() {}, updateEvent() {}, deleteEvent() {} };
registerAgendaPageRoute(app, { requireLogin, controller });
registerAgendaMutationRoutes(app, { requireLogin, controller });
assert.deepStrictEqual(calls.map(([method, url]) => [method, url]), [
  ['GET', '/agenda'], ['POST', '/agenda/add'], ['POST', '/agenda/update'], ['POST', '/agenda/delete'],
]);
assert.ok(calls.every((call) => call[2] === requireLogin));
console.log('OK - routes Agenda général');
