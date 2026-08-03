'use strict';

const assert = require('assert');
const fs = require('fs');
const { registerTasksPageRoutes, registerTasksMutationRoutes } = require('./routes/tasks');
const calls = [];
const app = {
  get(url, middleware, handler) { calls.push(['GET', url, middleware, handler]); },
  post(url, middleware, handler) { calls.push(['POST', url, middleware, handler]); }
};
const requireLogin = () => {};
const handlers = { showTasks() {}, createTask() {}, markTaskDone() {}, markTaskToInvoice() {}, deleteTask() {} };
registerTasksPageRoutes(app, { requireLogin, handlers });
registerTasksMutationRoutes(app, { requireLogin, handlers });
assert.deepStrictEqual(calls.map(([method, url]) => [method, url]), [
  ['GET', '/tasks'], ['POST', '/tasks/to-invoice'], ['POST', '/tasks'],
  ['POST', '/tasks/done'], ['POST', '/tasks/delete']
]);
assert(calls.every((call) => call[2] === requireLogin));
assert.strictEqual(new Set(calls.map(([method, url]) => `${method} ${url}`)).size, 5);
assert.strictEqual(calls.filter(([method, url]) => method === 'POST' && url === '/tasks/to-invoice').length, 1);
const source = fs.readFileSync('routes/tasks.js', 'utf8');
assert(!/<(?:article|form|section|script)\b/i.test(source));
assert(!/SELECT |INSERT INTO |UPDATE tasks|DELETE FROM /.test(source));
console.log('OK - routes tâches');
