'use strict';

function renderWorksiteCard(worksite, { escHtml, formatHours, statuses }) {
  const statusIndex = Math.max(0, statuses.indexOf(worksite.normalizedStatus));
  return `
    <article class="chantier-card">
      <div class="chantier-card-head"><div><h3>${escHtml(worksite.name)}</h3><p>${worksite.client_name ? escHtml(worksite.client_name) : 'Aucun client lié'}</p></div>
        <span class="chantier-status chantier-status-${statusIndex}">${escHtml(worksite.normalizedStatus)}</span></div>
      <div class="chantier-hours-grid">
        <div><span>Prévu</span><strong>${formatHours(worksite.plannedHours)}</strong></div>
        <div><span>Réalisé</span><strong>${formatHours(worksite.doneHours)}</strong></div>
        <div><span>Écart</span><strong class="${worksite.differenceHours > 0 ? 'chantier-over' : ''}">${formatHours(worksite.differenceHours)}</strong></div>
      </div>
      <div class="chantier-progress" aria-label="Avancement ${worksite.progress}%"><span style="width:${worksite.progress}%"></span></div>
      <div class="chantier-progress-label">${worksite.progress}% d’avancement</div>
      <a class="btn chantier-open-btn" href="/chantiers/${worksite.id}">Ouvrir</a>
    </article>`;
}

module.exports = { renderWorksiteCard };
