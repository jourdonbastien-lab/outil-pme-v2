'use strict';

function renderTasksListView({ tasks, taskCards, clientPageIcon }) {
  return `
      <div class="modern-page">
        <form method="POST" action="/tasks" class="clients-create-card modern-form-card">
          <div class="clients-create-head">
            ${clientPageIcon('tasks', 'clients-title-icon')}
            <h1>Tâches</h1>
          </div>

          <div class="modern-form-grid">
            <label class="clients-field">
              <span>Titre tâche</span>
              <div class="clients-input-shell">
                ${clientPageIcon('postal')}
                <input name="title" placeholder="Nouvelle tâche" required />
              </div>
            </label>

            <label class="clients-field">
              <span>Statut</span>
              <div class="clients-input-shell">
                ${clientPageIcon('add')}
                <select name="status">
                  <option>À faire</option>
              
                  <option>À facturer</option>
                </select>
              </div>
            </label>
          </div>

          <button class="clients-submit-btn" type="submit">
            <span>${clientPageIcon('add', 'clients-submit-icon')}</span>
            Ajouter la tâche
          </button>
        </form>

        <section class="modern-list-head">
          <div>
            <h2>Liste des tâches</h2>
            <span>${tasks.length} au total</span>
          </div>
        </section>

        <div class="modern-task-grid">
          ${taskCards}
        </div>
      </div>
      `;
}

module.exports = { renderTasksListView };
