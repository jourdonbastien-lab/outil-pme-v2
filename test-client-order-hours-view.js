'use strict';
const assert = require('assert');
const { renderClientOrderHoursView } = require('./views/clientOrderHoursView');
const base = { client: 'Client', order: '<Portail>', orderId: 7, rows: [], totalMinutes: 0, last7Minutes: 0,
  plannedHours: 2, diffHours: -2, isOver: false, isAtelier: false, today: '2026-07-26',
  escapeHtml: (v) => String(v).replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  formatMinutes: (v) => `${v} min`, formatDurationLabel: (v) => `${v} durée`,
  clientPageIcon: () => '<svg></svg>', pcFolderIcon: () => '<svg></svg>' };
let html = renderClientOrderHoursView(base);
assert(html.includes('<h1>Heures chantier</h1>'));
assert(html.includes('Aucune heure saisie pour ce chantier.'));
assert(html.includes('method="POST" action="/chantier-hours/add"'));
assert(html.includes('name="work_hours"') && html.includes('name="work_minutes"'));
assert(html.includes('&lt;Portail&gt;'));
html = renderClientOrderHoursView({ ...base, rows: [{ id: 3, work_date: '2026-07-25', minutes_total: 75, category: 'pose', note: 'Pose' }] });
assert(html.includes('action="/chantier-hours/delete"'));
assert(html.includes('Historique'));
console.log('OK - vue heures commandes');
