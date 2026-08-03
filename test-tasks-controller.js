'use strict';

const assert = require('assert');
const fs = require('fs');
const { createTasksController } = require('./controllers/tasksController');

const calls = [];
const tasks = [{ id: 2, title: 'B', status: 'À faire' }, { id: 1, title: 'A', status: 'Terminée' }];
const service = {
  listTasks() { calls.push(['list']); return tasks; },
  createTask(...args) { calls.push(['create', ...args]); },
  markTaskDone(id) { calls.push(['done', id]); },
  markTaskToInvoice(id) { calls.push(['invoice', id]); },
  deleteTask(id) { calls.push(['delete', id]); }
};
const dependencies = { escHtml() {}, clientPageIcon() {} };
const controller = createTasksController({
  tasksService: service,
  renderTaskCard(task, deps) { assert.strictEqual(deps, dependencies); return `CARD-${task.id}`; },
  renderTasksListView(data) { calls.push(['view', data]); return 'TASKS BODY'; },
  pageTemplate(req, title, body) { calls.push(['template', req, title, body]); return 'TASKS PAGE'; },
  viewDependencies: dependencies,
  now: () => new Date('2026-08-03T10:11:12.000Z')
});
const req = { body: {} };
const responses = [];
const res = { send(value) { responses.push(['send', value]); return this; }, redirect(value) { responses.push(['redirect', value]); return this; } };

controller.showTasks(req, res);
assert.deepStrictEqual(calls.find((call) => call[0] === 'view')[1], { tasks, taskCards: 'CARD-2CARD-1', clientPageIcon: dependencies.clientPageIcon });
assert.deepStrictEqual(calls.find((call) => call[0] === 'template').slice(1), [req, 'Tâches', 'TASKS BODY']);
assert.deepStrictEqual(responses.shift(), ['send', 'TASKS PAGE']);

controller.createTask({ body: { title: '  Nouvelle  ', status: ' En cours ' } }, res);
assert.deepStrictEqual(calls.find((call) => call[0] === 'create'), ['create', 'Nouvelle', 'En cours', '2026-08-03T10:11:12.000Z']);
const createCount = calls.filter((call) => call[0] === 'create').length;
controller.createTask({ body: { title: '   ', status: '' } }, res);
assert.strictEqual(calls.filter((call) => call[0] === 'create').length, createCount);
controller.createTask({ body: { title: 'Défaut' } }, res);
assert.strictEqual(calls.filter((call) => call[0] === 'create').at(-1)[2], 'À faire');

controller.markTaskDone({ body: { id: '7' } }, res);
controller.markTaskToInvoice({ body: { id: '8' } }, res);
controller.deleteTask({ body: { id: '9' } }, res);
assert(calls.some((call) => call[0] === 'done' && call[1] === '7'));
assert(calls.some((call) => call[0] === 'invoice' && call[1] === '8'));
assert(calls.some((call) => call[0] === 'delete' && call[1] === '9'));
assert(responses.filter((response) => response[0] === 'redirect').every((response) => response[1] === '/tasks'));

const source = fs.readFileSync('controllers/tasksController.js', 'utf8');
assert(!/SELECT |INSERT INTO |UPDATE tasks|DELETE FROM /.test(source));
assert(!/<article|<form|<section/.test(source));
console.log('OK - contrôleur tâches');
