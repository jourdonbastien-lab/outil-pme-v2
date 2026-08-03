'use strict';

const assert = require('assert');
const Database = require('better-sqlite3');
const { createTasksService } = require('./services/tasksService');
const { createTasksController } = require('./controllers/tasksController');
const { registerTasksPageRoutes } = require('./routes/tasks');

const db = new Database(':memory:');
db.exec('CREATE TABLE tasks (id INTEGER PRIMARY KEY, title TEXT, status TEXT, to_invoice INTEGER DEFAULT 0)');
db.prepare('INSERT INTO tasks (id, title, status) VALUES (1, ?, ?)').run('Test', 'Terminée');
const service = createTasksService({ db });
const controller = createTasksController({ tasksService: service, renderTasksListView() {}, renderTaskCard() {}, pageTemplate() {}, viewDependencies: {} });
const registered = [];
registerTasksPageRoutes({ get() {}, post(url, middleware, handler) { registered.push({ url, middleware, handler }); } }, { requireLogin() {}, handlers: controller });
assert.strictEqual(registered.length, 1, 'une seule route POST de page attendue');
assert.strictEqual(registered[0].url, '/tasks/to-invoice');
const responses = [];
registered[0].handler({ body: { id: '1' } }, { redirect(url) { responses.push(url); } });
assert.strictEqual(db.prepare('SELECT to_invoice FROM tasks WHERE id = 1').get().to_invoice, 1);
assert.deepStrictEqual(responses, ['/tasks']);
registered[0].handler({ body: { id: '999' } }, { redirect(url) { responses.push(url); } });
assert.deepStrictEqual(responses, ['/tasks', '/tasks']);
assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count, 1);
db.close();
console.log('OK - compatibilité tâches à facturer');
