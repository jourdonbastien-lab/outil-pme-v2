'use strict';

function validate(requireLogin, handlers) {
  if (typeof requireLogin !== 'function') throw new Error('requireLogin est requis');
  if (!handlers) throw new Error('handlers est requis');
}

function registerTasksPageRoutes(app, { requireLogin, handlers }) {
  if (!app || typeof app.get !== 'function' || typeof app.post !== 'function') throw new Error('app.get et app.post sont requis');
  validate(requireLogin, handlers);
  if (typeof handlers.showTasks !== 'function') throw new Error('handlers.showTasks est requis');
  if (typeof handlers.markTaskToInvoice !== 'function') throw new Error('handlers.markTaskToInvoice est requis');
  app.get('/tasks', requireLogin, handlers.showTasks);
  app.post('/tasks/to-invoice', requireLogin, handlers.markTaskToInvoice);
}

function registerTasksMutationRoutes(app, { requireLogin, handlers }) {
  if (!app || typeof app.post !== 'function') throw new Error('app.post est requis');
  validate(requireLogin, handlers);
  if (typeof handlers.createTask !== 'function') throw new Error('handlers.createTask est requis');
  if (typeof handlers.markTaskDone !== 'function') throw new Error('handlers.markTaskDone est requis');
  if (typeof handlers.deleteTask !== 'function') throw new Error('handlers.deleteTask est requis');
  app.post('/tasks', requireLogin, handlers.createTask);
  app.post('/tasks/done', requireLogin, handlers.markTaskDone);
  app.post('/tasks/delete', requireLogin, handlers.deleteTask);
}

module.exports = { registerTasksPageRoutes, registerTasksMutationRoutes };
