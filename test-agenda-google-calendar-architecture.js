'use strict';

const assert = require('assert');
const fs = require('fs');
const server = fs.readFileSync('server.js', 'utf8');
const agendaRoutes = fs.readFileSync('routes/agenda.js', 'utf8');
const googleRoutes = fs.readFileSync('routes/googleCalendar.js', 'utf8');
const services = ['services/agendaService.js', 'services/googleCalendarService.js', 'services/agendaSyncService.js'].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const views = ['views/agendaView.js', 'views/agendaEventCardView.js', 'views/googleCalendarView.js'].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const controllers = ['controllers/agendaController.js', 'controllers/googleCalendarController.js'].map((file) => fs.readFileSync(file, 'utf8')).join('\n');

assert.ok(!/app\.(?:get|post)\(['"]\/(?:agenda|google)/.test(server));
assert.strictEqual((agendaRoutes.match(/app\.(?:get|post)\(/g) || []).length, 4);
assert.strictEqual((googleRoutes.match(/app\.(?:get|post)\(/g) || []).length, 5);
assert.ok(server.indexOf('registerAgendaPageRoute(app') < server.indexOf('registerGoogleCalendarRoutes(app'));
assert.ok(server.indexOf('registerGoogleCalendarRoutes(app') < server.indexOf('registerAgendaMutationRoutes(app'));
assert.ok(server.includes("addClientOrderToAgenda: clientOrderAgendaController.addClientOrderToAgenda"));
assert.ok(!/\b(?:SELECT|INSERT|UPDATE|DELETE)\b/.test(agendaRoutes + googleRoutes + views));
assert.ok(!/\b(?:req|res)\./.test(services + views));
assert.ok(!/calendar\.events|googleapis/.test(agendaRoutes + googleRoutes + controllers + views));
assert.ok(!/require\(['"].*server/.test(agendaRoutes + googleRoutes + services + views + controllers));
assert.strictEqual((services.match(/planGoogleCancellations\(/g) || []).length, 2);
console.log('OK - architecture Agenda et Google Calendar');
