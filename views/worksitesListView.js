'use strict';

function renderWorksitesListView({ clients, worksites }, { escHtml, chantierStatusOptions, renderWorksiteCard, cardDependencies }) {
  const clientOptions = ['<option value="">Aucun client lié</option>',
    ...clients.map((client) => `<option value="${client.id}">${escHtml(client.name || 'Client')}</option>`)].join('');
  const cards = worksites.length ? worksites.map((worksite) => renderWorksiteCard(worksite, cardDependencies)).join('')
    : '<p class="dash-empty">Aucun chantier pour le moment.</p>';
  return `
      <div class="chantiers-page">
        <div class="page-head chantiers-head"><div><h1>Chantiers</h1></div><a class="btn btn-primary" href="#new-chantier">+ Nouveau chantier</a></div>
        <form id="new-chantier" method="POST" action="/chantiers" class="chantiers-form">
          <h2>Nouveau chantier</h2>
          <div class="chantiers-form-grid">
            <label><span>Nom du chantier *</span><input name="name" required placeholder="Ex: Verrière atelier" /></label>
            <label><span>Client</span><select name="client_id">${clientOptions}</select></label>
            <label><span>Statut</span><select name="status">${chantierStatusOptions('À préparer')}</select></label>
            <label><span>Heures prévues</span><input name="planned_hours" type="number" min="0" step="0.25" value="0" /></label>
            <label><span>Date début</span><input name="start_date" type="date" /></label>
            <label><span>Date fin prévue</span><input name="end_date" type="date" /></label>
            <label class="chantiers-form-wide"><span>Description</span><textarea name="description" rows="3" placeholder="Notes, périmètre, contraintes..."></textarea></label>
          </div>
          <div class="chantiers-form-actions"><button class="btn btn-primary" type="submit">Créer le chantier</button></div>
        </form>
        <section class="chantiers-grid">${cards}</section>
      </div>`;
}

module.exports = { renderWorksitesListView };
