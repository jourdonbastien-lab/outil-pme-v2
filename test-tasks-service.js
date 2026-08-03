'use strict';

const assert = require('assert');
const Database = require('better-sqlite3');
const { createTasksService } = require('./services/tasksService');

const db = new Database(':memory:');
db.exec(`CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, status TEXT, client_id INTEGER, created_at TEXT, to_invoice INTEGER DEFAULT 0)`);
const service = createTasksService({ db });

assert.deepStrictEqual(service.listTasks(), []);
service.createTask('Première', 'À faire', '2026-08-01T08:00:00.000Z');
service.createTask('Deuxième', 'Terminée', '2026-08-02T08:00:00.000Z');
service.createTask('Sans statut', null, null);
let tasks = service.listTasks();
assert.deepStrictEqual(tasks.map((task) => task.title), ['Deuxième', 'Première', 'Sans statut']);
assert.strictEqual(tasks[2].status, null);
assert.strictEqual(tasks[2].created_at, null);
assert.strictEqual(tasks[0].status, 'Terminée');
assert.strictEqual(tasks[1].to_invoice, 0);

const firstId = tasks[1].id;
assert.strictEqual(service.markTaskDone(firstId).changes, 1);
assert.strictEqual(service.markTaskDone(firstId).changes, 1);
assert.strictEqual(db.prepare('SELECT status FROM tasks WHERE id = ?').get(firstId).status, 'Terminée');
assert.strictEqual(service.markTaskDone(99999).changes, 0);

assert.strictEqual(service.markTaskToInvoice(firstId).changes, 1);
assert.strictEqual(service.markTaskToInvoice(firstId).changes, 1);
assert.strictEqual(db.prepare('SELECT to_invoice FROM tasks WHERE id = ?').get(firstId).to_invoice, 1);
assert.strictEqual(service.markTaskToInvoice(99999).changes, 0);

assert.strictEqual(service.deleteTask(99999).changes, 0);
assert.strictEqual(service.deleteTask(firstId).changes, 1);
assert.strictEqual(db.prepare('SELECT id FROM tasks WHERE id = ?').get(firstId), undefined);
assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count, 2);

const failing = createTasksService({ db: { prepare() { throw new Error('SQLite test'); } } });
for (const call of [
  () => failing.listTasks(),
  () => failing.createTask('x', 'À faire', 'date'),
  () => failing.markTaskDone(1),
  () => failing.markTaskToInvoice(1),
  () => failing.deleteTask(1)
]) assert.throws(call, /SQLite test/);

db.close();
console.log('OK - service tâches');
