'use strict';

const assert = require('assert');
const { registerGoogleCalendarRoutes } = require('./routes/googleCalendar');
const calls = [];
const app = { get: (...args) => calls.push(['GET', ...args]), post: (...args) => calls.push(['POST', ...args]) };
const requireLogin = () => {};
const controller = { connect() {}, callback() {}, syncRedirect() {}, sync() {}, listCalendars() {} };
registerGoogleCalendarRoutes(app, { requireLogin, controller });
assert.deepStrictEqual(calls.map(([method, url]) => [method, url]), [
  ['GET', '/google/auth'], ['GET', '/google/callback'], ['GET', '/google/sync'], ['POST', '/google/sync'], ['GET', '/google/calendars'],
]);
assert.ok(calls.every((call) => call[2] === requireLogin));
console.log('OK - routes Google Calendar');
