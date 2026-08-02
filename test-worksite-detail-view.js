'use strict';
const assert = require('assert');
const { renderWorksiteDetailView } = require('./views/worksiteDetailView');
const html = renderWorksiteDetailView({ id: 4, name: 'Pose', normalizedStatus: 'En pose', status: 'En pose', plannedHours: 8, doneHours: 9, differenceHours: 1, progress: 100, start_date: '', end_date: '', description: null }, { escHtml: String, formatHours: (v) => `${v}h`, chantierStatusOptions: () => '<option>En pose</option>', statuses: ['À préparer', 'En pose'] });
for (const token of ['chantier-detail', 'chantier-status-1', 'Heures prévues', 'chantier-over', 'Avancement 100%', 'Aucune description.', 'method="POST" action="/chantiers/4"', 'name="done_hours"']) assert(html.includes(token), token);
console.log('OK - détail chantier');
