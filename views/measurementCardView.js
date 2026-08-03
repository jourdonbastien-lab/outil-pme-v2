'use strict';
function renderMeasurementCard(row,{escHtml,measurementTitle,measurementLinkBadge,measurementRoutes,options={}}){return `<article class="measurement-linked-card"><div><strong>${escHtml(measurementTitle(row))}</strong><span>${escHtml(row.module||'Prise de cote')}</span></div>${measurementLinkBadge(row)}<a class="btn btn-secondary" href="${escHtml(measurementRoutes.canonicalMeasurementUrl(row,options)||`/outils/prises-cotes/fiche/${row.id}`)}">Ouvrir</a></article>`;}
function renderMeasurementCards(rows,deps){if(!rows.length)return'<div class="empty-state">Aucune prise de cote liée.</div>';return `<div class="measurement-linked-grid">${rows.map(row=>renderMeasurementCard(row,deps)).join('')}</div>`;}
module.exports={renderMeasurementCard,renderMeasurementCards};
