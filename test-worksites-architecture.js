'use strict';
const assert = require('assert'); const fs = require('fs');
const server = fs.readFileSync('server.js', 'utf8'); const route = fs.readFileSync('routes/worksites.js', 'utf8'); const service = fs.readFileSync('services/worksitesService.js', 'utf8');
const views = ['views/worksiteCardView.js', 'views/worksitesListView.js', 'views/worksiteDetailView.js'].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
assert(!/app\.(?:get|post)\(['"]\/chantiers/.test(server)); assert.strictEqual((route.match(/app\.(?:get|post)\('/g) || []).length, 4);
assert(!/\b(?:SELECT|INSERT|UPDATE|DELETE)\b/.test(route + views)); assert(!/\b(?:req|res)\./.test(service + views)); assert(!/require\(['"].*server/.test(route + service + views));
assert(server.includes('registerWorksitesRoutes(app')); assert(fs.readFileSync('routes/clientOrders.js', 'utf8').includes("post('/chantier-hours/add'"));
assert(!service.includes('client_order_id IS NULL')); assert(fs.readFileSync('services/googleCalendarService.js', 'utf8').includes('google.calendar('));
console.log('OK - architecture chantiers');
