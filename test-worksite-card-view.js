'use strict';
const assert = require('assert');
const { renderWorksiteCard } = require('./views/worksiteCardView');
const html = renderWorksiteCard({ id: 7, name: '<Pose>', client_name: null, normalizedStatus: 'En pose', plannedHours: 8, doneHours: 10, differenceHours: 2, progress: 100 }, { escHtml: (v) => String(v).replaceAll('<', '&lt;').replaceAll('>', '&gt;'), formatHours: (v) => `${v}h`, statuses: ['À préparer', 'En fabrication', 'En pose'] });
for (const token of ['chantier-card', '&lt;Pose&gt;', 'Aucun client lié', 'chantier-status-2', 'En pose', '8h', '10h', 'chantier-over', 'width:100%', 'href="/chantiers/7"']) assert(html.includes(token), token);
console.log('OK - carte chantier');
