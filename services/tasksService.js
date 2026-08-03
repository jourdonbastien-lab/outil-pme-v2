'use strict';

function createTasksService({ db }) {
  if (!db || typeof db.prepare !== 'function') throw new Error('db est requis');

  function listTasks() {
    return db.prepare('SELECT * FROM tasks ORDER BY created_at DESC, id DESC').all();
  }

  function createTask(title, status, createdAt) {
    return db.prepare(`
      INSERT INTO tasks (title, status, created_at)
      VALUES (?, ?, ?)
    `).run(title, status, createdAt);
  }

  function markTaskDone(id) {
    return db.prepare(`
      UPDATE tasks
      SET status = 'Terminée'
      WHERE id = ?
    `).run(id);
  }

  function markTaskToInvoice(id) {
    return db.prepare(`
      UPDATE tasks
      SET to_invoice = 1
      WHERE id = ?
    `).run(id);
  }

  function deleteTask(id) {
    return db.prepare(`
      DELETE FROM tasks
      WHERE id = ?
    `).run(id);
  }

  return { listTasks, createTask, markTaskDone, markTaskToInvoice, deleteTask };
}

module.exports = { createTasksService };
