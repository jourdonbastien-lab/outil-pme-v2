'use strict';

function renderClientOrderFilesList(data) {
  const { files, client, order, type, escapeHtml: escHtml, pcFolderIcon } = data;
  if (!files.length) return '<div class="empty-state">Aucun fichier dans ce dossier.</div>';
  return `<div class="pc-modern-grid pc-modern-file-grid">${files.map((file) => `
    <article class="pc-modern-card pc-modern-file-card">
      ${pcFolderIcon(file.iconName)}
      <div class="pc-modern-main"><strong>${escHtml(file.name)}</strong><span>Fichier</span></div>
      <div class="pc-modern-file-actions">
        <a class="pc-modern-open" href="/pc-file/${encodeURIComponent(client)}/${encodeURIComponent(order)}/${encodeURIComponent(type)}/${encodeURIComponent(file.name)}" target="_blank">Ouvrir</a>
        ${file.invoiceAnalyzeAction || ''}
      </div>
    </article>`).join('')}</div>`;
}

function renderPurchasesBlock(data) {
  const {
    type, orderDb, purchases, escapeHtml: escHtml, clientPageIcon,
    normalizePurchaseStatus, purchaseStatusClass, purchaseStatusOptions, formatDateLabel
  } = data;
  if (type !== 'Commandes') return '';
  if (!orderDb) return `
    <section class="pc-modern-panel order-purchases-panel">
      <div class="modern-section-title">${clientPageIcon('materials', 'clients-title-icon')}<div>
        <h2>Quincaillerie et achats à commander</h2><p>Commande non retrouvée en base, liste indisponible.</p>
      </div></div>
    </section>`;
  const cards = purchases.length ? purchases.map((item) => {
    const status = normalizePurchaseStatus(item.status);
    return `
      <article class="order-purchase-card">
        <div class="order-purchase-main"><div>
          <h3>${escHtml(item.designation || 'Article')}</h3>
          <p>
            ${item.category ? `<span>${escHtml(item.category)}</span>` : ''}
            <span>${Number(item.qty || 0).toLocaleString('fr-FR')} ${escHtml(item.unit || '')}</span>
            ${item.reference ? `<span>Réf. ${escHtml(item.reference)}</span>` : ''}
            ${item.supplier ? `<span>${escHtml(item.supplier)}</span>` : ''}
            ${item.needed_date ? `<span>Besoin ${escHtml(formatDateLabel(item.needed_date))}</span>` : ''}
          </p>
          ${item.note ? `<small>${escHtml(item.note)}</small>` : ''}
        </div><span class="order-purchase-status ${purchaseStatusClass(status)}">${escHtml(status)}</span></div>
        <details class="order-purchase-edit"><summary>Modifier</summary>
          <form method="POST" action="/orders/client/${orderDb.id}/purchases/${item.id}/update" class="order-purchase-form">
            <div class="order-purchase-form-grid">
              <label class="clients-field"><span>Désignation</span><div class="clients-input-shell"><input name="designation" value="${escHtml(item.designation || '')}" required></div></label>
              <label class="clients-field"><span>Catégorie</span><div class="clients-input-shell"><input name="category" value="${escHtml(item.category || '')}" placeholder="Quincaillerie, acier..."></div></label>
              <label class="clients-field"><span>Quantité</span><div class="clients-input-shell"><input type="number" min="0" step="0.01" name="qty" value="${escHtml(String(Number(item.qty || 0)))}"></div></label>
              <label class="clients-field"><span>Unité</span><div class="clients-input-shell"><input name="unit" value="${escHtml(item.unit || '')}" placeholder="pièce, ml, lot"></div></label>
              <label class="clients-field"><span>Référence</span><div class="clients-input-shell"><input name="reference" value="${escHtml(item.reference || '')}"></div></label>
              <label class="clients-field"><span>Fournisseur</span><div class="clients-input-shell"><input name="supplier" value="${escHtml(item.supplier || '')}"></div></label>
              <label class="clients-field"><span>Date de besoin</span><div class="clients-input-shell"><input type="date" name="needed_date" value="${escHtml(String(item.needed_date || '').slice(0, 10))}"></div></label>
              <label class="clients-field"><span>Statut</span><div class="clients-input-shell"><select name="status">${purchaseStatusOptions(status)}</select></div></label>
              <label class="clients-field order-purchase-wide"><span>Note</span><div class="clients-input-shell"><input name="note" value="${escHtml(item.note || '')}"></div></label>
            </div>
            <div class="order-purchase-actions"><button class="clients-submit-btn" type="submit">Enregistrer</button></div>
          </form>
        </details>
        <form method="POST" action="/orders/client/${orderDb.id}/purchases/${item.id}/delete" class="order-purchase-delete" onsubmit="return confirm('Supprimer cet article ?');">
          <button class="modern-danger-btn" type="submit">${clientPageIcon('trash', 'modern-action-icon')} Supprimer</button>
        </form>
      </article>`;
  }).join('') : '<div class="empty-state">Aucun achat à commander pour cette commande.</div>';
  return `
    <section class="pc-modern-panel order-purchases-panel">
      <div class="modern-section-title">${clientPageIcon('materials', 'clients-title-icon')}<div>
        <h2>Quincaillerie et achats à commander</h2><p>${purchases.length} article${purchases.length > 1 ? 's' : ''}</p>
      </div></div>
      <form method="POST" action="/orders/client/${orderDb.id}/purchases" class="order-purchase-form order-purchase-add-form">
        <div class="order-purchase-form-grid">
          <label class="clients-field order-purchase-wide"><span>Désignation</span><div class="clients-input-shell"><input name="designation" placeholder="Ex : chevilles, visserie, paumelles..." required></div></label>
          <label class="clients-field"><span>Catégorie</span><div class="clients-input-shell"><input name="category" placeholder="Quincaillerie, acier..."></div></label>
          <label class="clients-field"><span>Quantité</span><div class="clients-input-shell"><input type="number" min="0" step="0.01" name="qty" value="1"></div></label>
          <label class="clients-field"><span>Unité</span><div class="clients-input-shell"><input name="unit" placeholder="pièce"></div></label>
          <label class="clients-field"><span>Référence</span><div class="clients-input-shell"><input name="reference" placeholder="Référence fournisseur"></div></label>
          <label class="clients-field"><span>Fournisseur</span><div class="clients-input-shell"><input name="supplier" placeholder="Fournisseur"></div></label>
          <label class="clients-field"><span>Date de besoin</span><div class="clients-input-shell"><input type="date" name="needed_date"></div></label>
          <label class="clients-field"><span>Statut</span><div class="clients-input-shell"><select name="status">${purchaseStatusOptions('À commander')}</select></div></label>
          <label class="clients-field order-purchase-wide"><span>Note</span><div class="clients-input-shell"><input name="note" placeholder="Détail, dimensions, consigne..."></div></label>
        </div>
        <div class="order-purchase-actions"><button class="clients-submit-btn" type="submit"><span>${clientPageIcon('add', 'clients-submit-icon')}</span> Ajouter l'article</button></div>
      </form>
      <div class="order-purchase-list">${cards}</div>
    </section>`;
}

function renderClientOrderFolderView(data) {
  const { client, order, type, files, filesHtml, purchasesHtml, invoicesHtml, escapeHtml: escHtml, pcFolderIcon } = data;
  return `
    <div class="pc-modern-page">
      <section class="pc-modern-hero">
        <div><span>Dossier</span><h1>${escHtml(type)}</h1><p>${files.length} fichier${files.length > 1 ? 's' : ''}</p></div>
        <div class="pc-modern-actions">
          <a class="modern-cancel-link" href="/pc-folders/${encodeURIComponent(client)}">Client</a>
          <a class="clients-submit-btn" href="/pc-folders/${encodeURIComponent(client)}/${encodeURIComponent(order)}">Retour commande</a>
        </div>
      </section>
      <section class="pc-modern-panel">
        <div class="modern-section-title">${pcFolderIcon(type, 'clients-title-icon')}<div><h2>Ajouter un fichier</h2></div></div>
        <form method="POST" action="/pc-folders/${encodeURIComponent(client)}/${encodeURIComponent(order)}/${encodeURIComponent(type)}/upload" enctype="multipart/form-data" class="pc-modern-upload-form">
          <input type="file" name="file" required /><button class="clients-submit-btn" type="submit">Ajouter</button>
        </form>
      </section>
      <section class="pc-modern-panel">
        <div class="modern-section-title">${pcFolderIcon('file', 'clients-title-icon')}<div><h2>Fichiers</h2></div></div>
        ${filesHtml}
      </section>
      ${purchasesHtml}
      ${invoicesHtml}
    </div>`;
}

function renderClientOrderRootFolderView(data) {
  const {
    client, order, folders, orderDb, linkedMeasurementsHtml,
    escapeHtml: escHtml, pcFolderIcon, clientPageIcon,
    chantierStatusOptions
  } = data;
  const cards = folders.map((type) => `
    <article class="pc-modern-card">
      <a class="pc-modern-card-link" href="/pc-folders/${encodeURIComponent(client)}/${encodeURIComponent(order)}/${encodeURIComponent(type)}" aria-label="Ouvrir ${escHtml(type)}"></a>
      ${pcFolderIcon(type)}
      <div class="pc-modern-main"><strong>${escHtml(type)}</strong><span>Dossier</span></div>
      <span class="pc-modern-open">Ouvrir</span>
    </article>`).join('');
  const profitability = orderDb ? `
    <article class="pc-modern-card pc-profitability-access">
      <a class="pc-modern-card-link" href="/orders/client/${orderDb.id}/profitability" aria-label="Ouvrir Rentabilité"></a>
      ${pcFolderIcon('Rentabilité')}
      <div class="pc-modern-main"><strong>Rentabilité</strong><span>Prévisionnel et réel</span></div>
      <span class="pc-modern-open">Ouvrir</span>
    </article>` : '';
  const chantierControl = orderDb ? `
    <form method="POST" action="/orders/client/${orderDb.id}/chantier" class="chantier-status-card-form" data-auto-submit>
      <label><span>Étape chantier</span><select name="chantier_status" onchange="this.form.requestSubmit()">${chantierStatusOptions(orderDb.chantier_status)}</select></label>
    </form>` : '';
  const hoursUrl = `/pc-folders/${encodeURIComponent(client)}/${encodeURIComponent(order)}/Heure%20chantier`;
  const stairUrl = orderDb
    ? `/outils/prises-cotes/escalier-v2?client_order_id=${encodeURIComponent(String(orderDb.id))}`
    : '/outils/prises-cotes/escalier-v2';
  return `
    <div class="pc-modern-page">
      <section class="pc-modern-hero pc-order-hero">
        <div class="pc-order-hero-main"><span>Commande</span><h1>${escHtml(order)}</h1><p>${folders.length} dossier${folders.length > 1 ? 's' : ''}</p></div>
        <div class="pc-modern-actions pc-order-hero-actions">
          ${chantierControl}
          <div class="pc-order-hero-links">
            <a class="pc-order-hero-link pc-order-hours-link" href="${hoursUrl}">${pcFolderIcon('Heure chantier', 'pc-order-hero-link-icon')} Saisir des heures</a>
            <a class="pc-order-hero-link" href="/pc-folders/${encodeURIComponent(client)}">${clientPageIcon('clients', 'pc-order-hero-link-icon')} Client</a>
            <a class="pc-order-hero-link" href="/orders/clients">${clientPageIcon('folder', 'pc-order-hero-link-icon')} Commandes</a>
            <a class="pc-order-hero-link" href="${stairUrl}">${clientPageIcon('measurements', 'pc-order-hero-link-icon')} Escalier V2</a>
          </div>
        </div>
      </section>
      <section class="pc-modern-grid">${cards}${profitability}</section>
      <section class="pc-modern-panel measurement-linked-section">
        <div class="modern-section-title">${pcFolderIcon('Plans', 'clients-title-icon')}<div><h2>Prises de cotes liées</h2></div></div>
        ${linkedMeasurementsHtml}
      </section>
    </div>`;
}

module.exports = {
  renderClientOrderFolderView,
  renderClientOrderRootFolderView,
  renderClientOrderFilesList,
  renderPurchasesBlock
};
