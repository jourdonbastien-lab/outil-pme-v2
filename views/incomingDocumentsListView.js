'use strict';

function renderIncomingDocumentsListView(data, dependencies) {
  const { status, type, period, search, page, rows, counts, pages, statuses, documentTypes, maxFileSizeBytes } = data;
  const { escHtml, clientPageIcon, renderIncomingDocumentCard, formatDateTimeLabel, formatFileSize, formatEuroFr } = dependencies;
  const options = (values, selected) => values.map((value) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${escHtml(value.replaceAll('_', ' '))}</option>`).join('');
  const cards = rows.length ? rows.map((doc) => renderIncomingDocumentCard(doc, { escHtml, formatDateTimeLabel, formatFileSize, formatEuroFr, renderOptions: options, documentTypes })).join('') : '<p class="empty">Aucun document entrant pour ces filtres.</p>';
  const query = new URLSearchParams({ status, type, period: period || '', search }).toString();
  return `<div class="modern-page incoming-documents-page">
    <section class="modern-list-head"><div class="clients-create-head">${clientPageIcon('quotes', 'clients-title-icon')}<div><h1>Documents entrants</h1><span>Scans Ricoh et imports manuels à classer</span></div></div></section>
    <section class="incoming-summary"><div><strong>${Number(counts.nouveaux || 0)}</strong><span>Nouveaux</span></div><div><strong>${Number(counts.a_classer || 0)}</strong><span>À classer</span></div><div><strong>${Number(counts.erreurs || 0)}</strong><span>Erreurs</span></div></section>
    <details class="clients-create-card incoming-upload"><summary class="clients-submit-btn">Importer un document</summary><form method="POST" action="/documents-entrants/upload" enctype="multipart/form-data"><input type="file" name="document" accept="application/pdf,image/jpeg,image/png" required><button class="clients-submit-btn" type="submit">Importer</button><small>PDF, JPG ou PNG · ${Math.round(maxFileSizeBytes / 1024 / 1024)} Mo maximum</small></form></details>
    <form class="incoming-filters" method="GET"><select name="status"><option value="">Tous les statuts</option>${options(statuses, status)}</select><select name="type"><option value="">Tous les types</option>${options(documentTypes, type)}</select><select name="period"><option value="">Toute période</option><option value="7" ${period === 7 ? 'selected' : ''}>7 jours</option><option value="30" ${period === 30 ? 'selected' : ''}>30 jours</option><option value="90" ${period === 90 ? 'selected' : ''}>90 jours</option></select><input name="search" value="${escHtml(search)}" placeholder="Fournisseur, numéro, fichier"><button class="modern-secondary-btn">Filtrer</button></form>
    <section class="incoming-document-list">${cards}</section><nav class="incoming-pagination"><span>Page ${page} / ${pages}</span>${page > 1 ? `<a href="?${query}&page=${page - 1}">Précédent</a>` : ''}${page < pages ? `<a href="?${query}&page=${page + 1}">Suivant</a>` : ''}</nav>
  </div>`;
}

module.exports = { renderIncomingDocumentsListView };
