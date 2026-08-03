'use strict';

const assert = require('assert');
const fs = require('fs');
const server = fs.readFileSync('server.js', 'utf8');
const routes = fs.readFileSync('routes/tasks.js', 'utf8');
const service = fs.readFileSync('services/tasksService.js', 'utf8');
const controller = fs.readFileSync('controllers/tasksController.js', 'utf8');
const views = fs.readFileSync('views/tasksListView.js', 'utf8') + fs.readFileSync('views/taskCardView.js', 'utf8');
const dashboardService = fs.readFileSync('services/dashboardService.js', 'utf8');

for (const marker of ["app.get('/tasks'", "app.post('/tasks'", "app.post('/tasks/done'", "app.post('/tasks/delete'", "app.post('/tasks/to-invoice'"]) assert(!server.includes(marker), `${marker}: route encore inline`);
for (const declaration of ["app.get('/tasks'", "app.post('/tasks'", "app.post('/tasks/done'", "app.post('/tasks/delete'", "app.post('/tasks/to-invoice'"]) assert.strictEqual(routes.split(declaration).length - 1, 1, `${declaration}: présence unique attendue`);
assert(server.indexOf('registerTasksPageRoutes(app') < server.indexOf('registerAgendaPageRoute(app'));
assert(server.indexOf('registerWorkshopToolsRoutes(app') < server.indexOf('registerTasksMutationRoutes(app'));
assert(server.indexOf('registerTasksMutationRoutes(app') < server.indexOf('registerSupplierOrderCompletionRoutes(app'));
assert(server.includes('CREATE TABLE IF NOT EXISTS tasks'));
assert(server.includes("SELECT COUNT(*) AS c FROM tasks WHERE status != 'Terminée'"));
assert(dashboardService.includes("SELECT * FROM tasks WHERE status != 'Terminée' ORDER BY created_at DESC LIMIT 5"));
assert(!/require\(['"].*server/.test(routes + service + controller + views));
assert(!/\b(?:req|res)\./.test(service + views));
assert(!/\bfs\.|\bpath\./.test(views));
assert(!/SELECT |INSERT INTO |UPDATE tasks|DELETE FROM /.test(routes + views));
console.log('OK - architecture tâches');
