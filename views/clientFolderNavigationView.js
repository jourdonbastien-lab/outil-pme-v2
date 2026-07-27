'use strict';

function renderClientFolderNavigationView(data) {
  const { client, folders, escapeHtml: escHtml, pcFolderIcon } = data;
  const cards = folders.length
    ? folders.map((folder) => `
      <article class="pc-modern-card">
        <a class="pc-modern-card-link" href="${folder.url}" aria-label="Ouvrir ${escHtml(folder.displayName)}"></a>
        ${pcFolderIcon('Commandes')}
        <div class="pc-modern-main">
          <strong>${escHtml(folder.displayName)}</strong>
          <span>Commande</span>
        </div>
        <span class="pc-modern-open">Ouvrir</span>
      </article>`).join('')
    : '<div class="empty-state">Aucune commande trouvée.</div>';
  return `
    <div class="pc-modern-page">
      <section class="pc-modern-hero">
        <div>
          <span>Client</span>
          <h1>${escHtml(client)}</h1>
          <p>${folders.length} commande${folders.length > 1 ? 's' : ''}</p>
        </div>
        <a class="modern-cancel-link" href="/clients">Retour clients</a>
      </section>
      <section class="pc-modern-grid">
        ${cards}
      </section>
    </div>`;
}

module.exports = { renderClientFolderNavigationView };
