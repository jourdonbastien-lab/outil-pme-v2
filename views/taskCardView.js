'use strict';

function renderTaskCard(task, { escHtml, clientPageIcon }) {
  const status = String(task.status || 'À faire');
  const statusClass = status === 'Terminée' ? 'done' : status === 'En cours' ? 'progress' : 'todo';
  return `
        <article class="modern-task-card">
          <div class="modern-task-main">
            ${clientPageIcon('tasks', 'modern-page-icon')}
            <div>
              <h2>${escHtml(task.title)}</h2>
              <span class="modern-status-badge ${statusClass}">${escHtml(status)}</span>
            </div>
          </div>

          <div class="modern-task-actions">
            ${
              status !== 'Terminée'
                ? `
                <form method="POST" action="/tasks/done" class="modern-task-done-form">
                  <input type="hidden" name="id" value="${task.id}" />
                  <button class="modern-secondary-btn modern-task-done-btn" type="submit">✓ Terminer</button>
                </form>
                `
                : `
                ${
                  Number(task.to_invoice || 0) === 1
                    ? `<div class="modern-invoice-badge">À facturer</div>`
                    : `
                    <form method="POST" action="/tasks/to-invoice">
                      <input type="hidden" name="id" value="${task.id}" />
                      <button class="modern-secondary-btn" type="submit">À facturer</button>
                    </form>
                    `
                }

                <form method="POST"
                      action="/tasks/delete"
                      onsubmit="return confirm('Supprimer cette tâche ?');">
                  <input type="hidden" name="id" value="${task.id}" />
                  <button class="modern-danger-btn" type="submit">${clientPageIcon('trash', 'modern-action-icon')} Supprimer</button>
                </form>
                `
            }
          </div>
        </article>
      `;
}

module.exports = { renderTaskCard };
