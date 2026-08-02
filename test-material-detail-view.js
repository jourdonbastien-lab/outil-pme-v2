'use strict';
const assert = require('assert');
const { renderMaterialDetailView } = require('./views/materialDetailView');
const escHtml = (value) => String(value).replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const html = renderMaterialDetailView({ material: { name: 'Acier <brut>', type: 'tube', unit: 'ml', price: 4.5, kg_per_m: 2.2, density: 7.85 }, id: 3, saved: true, createdLabel: '02/08/2026' }, { escHtml, clientPageIcon: (name) => `<i>${name}</i>` });
for (const token of ['material-detail-page', 'Acier &lt;brut>', '4.50 €', '2.2', '7.85', '02/08/2026', 'action="/materials/3"', 'action="/materials/delete"', 'name="id" value="3"', 'Supprimer cette matière ?', 'Matière enregistrée.']) assert(html.includes(token), token);
console.log('OK - détail matière');
