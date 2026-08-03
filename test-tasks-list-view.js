'use strict';

const assert = require('assert');
const { renderTasksListView } = require('./views/tasksListView');
const icon = (name, className) => `<i data-icon="${name}" data-class="${className || ''}"></i>`;

const empty = renderTasksListView({ tasks: [], taskCards: '<div class="empty-state">Aucune tâche</div>', clientPageIcon: icon });
for (const expected of [
  '<h1>Tâches</h1>', 'method="POST" action="/tasks"', 'name="title"',
  'placeholder="Nouvelle tâche"', 'name="status"', '<option>À faire</option>',
  '<option>À facturer</option>', 'Ajouter la tâche', 'Liste des tâches',
  '<span>0 au total</span>', 'modern-task-grid', 'Aucune tâche',
  'data-icon="tasks"', 'data-icon="postal"', 'data-icon="add"'
]) assert(empty.includes(expected), `Vue tâches: contenu absent: ${expected}`);

const several = renderTasksListView({ tasks: [{}, {}], taskCards: '<article>A</article><article>B</article>', clientPageIcon: icon });
assert(several.includes('<span>2 au total</span>'));
assert(several.includes('<article>A</article><article>B</article>'));
console.log('OK - liste tâches');
