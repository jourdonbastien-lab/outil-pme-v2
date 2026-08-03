'use strict';

function createTasksController({ tasksService, renderTasksListView, renderTaskCard, pageTemplate, viewDependencies, now = () => new Date() }) {
  if (!tasksService) throw new Error('tasksService est requis');
  if (typeof renderTasksListView !== 'function') throw new Error('renderTasksListView est requis');
  if (typeof renderTaskCard !== 'function') throw new Error('renderTaskCard est requis');
  if (typeof pageTemplate !== 'function') throw new Error('pageTemplate est requis');

  function showTasks(req, res) {
    const tasks = tasksService.listTasks();
    const taskCards = tasks.length
      ? tasks.map((task) => renderTaskCard(task, viewDependencies)).join('')
      : '<div class="empty-state">Aucune tâche</div>';
    const body = renderTasksListView({ tasks, taskCards, clientPageIcon: viewDependencies.clientPageIcon });
    res.send(pageTemplate(req, 'Tâches', body));
  }

  function createTask(req, res) {
    const title = String(req.body.title || '').trim();
    const status = String(req.body.status || 'À faire').trim();
    if (!title) return res.redirect('/tasks');
    tasksService.createTask(title, status, now().toISOString());
    return res.redirect('/tasks');
  }

  function markTaskDone(req, res) {
    tasksService.markTaskDone(req.body.id);
    return res.redirect('/tasks');
  }

  function markTaskToInvoice(req, res) {
    tasksService.markTaskToInvoice(req.body.id);
    return res.redirect('/tasks');
  }

  function deleteTask(req, res) {
    tasksService.deleteTask(req.body.id);
    return res.redirect('/tasks');
  }

  return { showTasks, createTask, markTaskDone, markTaskToInvoice, deleteTask };
}

module.exports = { createTasksController };
