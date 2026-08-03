'use strict';

const assert = require('assert');
const { renderTaskCard } = require('./views/taskCardView');
const escHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const clientPageIcon = (name, className) => `<i data-icon="${name}" data-class="${className || ''}"></i>`;

const todo = renderTaskCard({ id: 4, title: `<Test d'été>`, status: 'En cours' }, { escHtml, clientPageIcon });
assert(todo.includes('&lt;Test d&#39;été&gt;'));
assert(todo.includes('modern-status-badge progress'));
assert(todo.includes('action="/tasks/done"'));
assert(todo.includes('name="id" value="4"'));
assert(todo.includes('✓ Terminer'));
assert(!todo.includes('action="/tasks/delete"'));

const done = renderTaskCard({ id: 5, title: 'Terminée', status: 'Terminée', to_invoice: 0 }, { escHtml, clientPageIcon });
assert(done.includes('modern-status-badge done'));
assert(done.includes('action="/tasks/to-invoice"'));
assert(done.includes('action="/tasks/delete"'));
assert(done.includes("confirm('Supprimer cette tâche ?')"));
assert(done.includes('data-icon="trash"'));

const invoice = renderTaskCard({ id: 6, title: 'Facturation', status: 'Terminée', to_invoice: 1 }, { escHtml, clientPageIcon });
assert(invoice.includes('<div class="modern-invoice-badge">À facturer</div>'));
assert(!invoice.includes('action="/tasks/to-invoice"'));

const fallback = renderTaskCard({ id: 7, title: 'Vide', status: null }, { escHtml, clientPageIcon });
assert(fallback.includes('modern-status-badge todo'));
assert(fallback.includes('À faire'));
console.log('OK - carte tâche');
