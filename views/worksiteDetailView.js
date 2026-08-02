'use strict';

function renderWorksiteDetailView(worksite, { escHtml, formatHours, chantierStatusOptions, statuses }) {
  const statusIndex = Math.max(0, statuses.indexOf(worksite.normalizedStatus));
  return `
      <div class="chantier-detail">
        <section class="chantier-detail-hero"><div><span class="chantier-status chantier-status-${statusIndex}">${escHtml(worksite.normalizedStatus)}</span><h1>${escHtml(worksite.name)}</h1></div><a class="btn btn-secondary" href="/chantiers">Retour</a></section>
        <section class="chantier-detail-grid">
          <article class="chantier-metric"><span>Heures prévues</span><strong>${formatHours(worksite.plannedHours)}</strong></article>
          <article class="chantier-metric"><span>Heures réalisées</span><strong>${formatHours(worksite.doneHours)}</strong></article>
          <article class="chantier-metric"><span>Écart</span><strong class="${worksite.differenceHours > 0 ? 'chantier-over' : ''}">${formatHours(worksite.differenceHours)}</strong></article>
          <article class="chantier-metric"><span>Avancement</span><strong>${worksite.progress}%</strong></article>
        </section>
        <section class="chantier-detail-panel"><h2>Avancement</h2><div class="chantier-progress chantier-progress-large" aria-label="Avancement ${worksite.progress}%"><span style="width:${worksite.progress}%"></span></div>
          <div class="chantier-dates"><span>Début : ${escHtml(worksite.start_date || '—')}</span><span>Fin prévue : ${escHtml(worksite.end_date || '—')}</span></div><p>${worksite.description ? escHtml(worksite.description) : 'Aucune description.'}</p></section>
        <form method="POST" action="/chantiers/${worksite.id}" class="chantiers-form"><h2>Modifier le chantier</h2>
          <div class="chantiers-form-grid">
            <label><span>Statut</span><select name="status">${chantierStatusOptions(worksite.status)}</select></label>
            <label><span>Heures prévues</span><input name="planned_hours" type="number" min="0" step="0.25" value="${worksite.plannedHours}" /></label>
            <label><span>Heures réalisées</span><input name="done_hours" type="number" min="0" step="0.25" value="${worksite.doneHours}" /></label>
            <label><span>Date début</span><input name="start_date" type="date" value="${escHtml(worksite.start_date || '')}" /></label>
            <label><span>Date fin prévue</span><input name="end_date" type="date" value="${escHtml(worksite.end_date || '')}" /></label>
            <label class="chantiers-form-wide"><span>Description</span><textarea name="description" rows="4">${escHtml(worksite.description || '')}</textarea></label>
          </div><div class="chantiers-form-actions"><button class="btn btn-primary" type="submit">Enregistrer</button></div>
        </form>
      </div>`;
}

module.exports = { renderWorksiteDetailView };
