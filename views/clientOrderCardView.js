'use strict';

function renderQuoteOptions(quotes = [], selectedId, escapeHtml) {
  return `<option value="">Aucun devis lié</option>${quotes.map((quote) =>
    `<option value="${quote.id}" ${Number(selectedId) === Number(quote.id) ? 'selected' : ''}>#${quote.id} · ${escapeHtml(quote.client_name || '')} · ${escapeHtml(quote.title || 'Sans titre')}</option>`
  ).join('')}`;
}

function renderClientOrderCard(card, context) {
  const {
    isWorkshop, availableQuotes, escapeHtml: escHtml, clientPageIcon,
    pcFolderIcon, chantierStatusOptions
  } = context;
  const order = card.order;
  const editVatOptions = `
    <option value=""${card.vatRate === null ? ' selected' : ''}>TVA non renseignée</option>
    <option value="20"${card.vatRate === 20 ? ' selected' : ''}>TVA 20 %</option>
    <option value="10"${card.vatRate === 10 ? ' selected' : ''}>TVA 10 %</option>
  `;
  return `
    <article class="order-card modern-client-order-card">
      <header class="modern-client-order-head">
        <div class="modern-client-order-icon">${clientPageIcon('folder', 'modern-client-order-svg')}</div>
        <div class="modern-client-order-title">
          <h2>${escHtml(order.description || `Commande #${order.id}`)}</h2>
          <p>${escHtml(order.name || 'Client non renseigné')}</p>
        </div>
        <span class="modern-status-badge progress">${escHtml(card.statusLabel)}</span>
      </header>

      <div class="modern-client-order-row">
        <span class="chantier-status ${card.chantierStatusClass}">${escHtml(card.chantierStatus)}</span>
        <strong>${card.progress}%</strong>
        <span class="modern-client-order-hours-total">${card.actualHours.toFixed(1)} h</span>
        ${card.isLate ? '<span class="modern-late-badge">Retard</span>' : ''}
      </div>

      <div class="modern-client-order-info-list">
        <div><span>Date commande</span><strong>${escHtml(card.dateLabel || 'Non renseignée')}</strong></div>
        ${!isWorkshop ? `
        <div><span>Montant commande HT</span><strong>${escHtml(card.amountHtLabel)}</strong></div>
        <div><span>Deja facture HT</span><strong>${escHtml(card.invoicedHtLabel)}</strong></div>
        <div><span>Reste a facturer HT</span><strong>${escHtml(card.remainingHtLabel)}</strong></div>
        <div><span>TVA</span><strong>${escHtml(card.vatLabel)}</strong></div>
        <div><span>Prix TTC</span><strong>${escHtml(card.amountTtcLabel)}</strong></div>
        ` : ''}
      </div>

      <div class="modern-client-order-progress">
        <div class="chantier-progress client-order-stage-progress ${card.isOverHours ? 'over-hours' : 'ok-hours'}"><span style="width:${card.progress}%"></span></div>
      </div>

      ${card.isPoseStatus ? `
      <section class="modern-client-order-agenda-block">
        ${card.poseEvent ? `
        <div class="modern-client-order-agenda-inline modern-client-order-agenda-ready">
          <a class="modern-client-order-open modern-client-order-agenda-trigger" href="/agenda">
            ${clientPageIcon('calendar', 'modern-client-order-open-icon')}
            <span>Voir dans l'agenda</span><b aria-hidden="true">›</b>
          </a>
          <span class="modern-status-badge done">Pose déjà planifiée</span>
        </div>` : `
        <details class="modern-client-order-agenda-inline">
          <summary class="modern-client-order-open modern-client-order-agenda-trigger">
            ${clientPageIcon('calendar', 'modern-client-order-open-icon')}
            <span>Ajouter à l’agenda</span><b aria-hidden="true">›</b>
          </summary>
          <form method="POST" action="/orders/client/${order.id}/add-agenda-pose" class="modern-client-order-add-form modern-client-order-agenda-form">
            <input type="hidden" name="client" value="${escHtml(order.name || '')}">
            <input type="hidden" name="order_name" value="${escHtml(order.description || '')}">
            <input type="hidden" name="title" value="${escHtml(card.poseAgendaTitle)}">
            <div class="modern-client-order-agenda-grid">
              <label class="clients-field modern-client-order-agenda-field-wide"><span>Date de pose</span><div class="clients-input-shell">${clientPageIcon('calendar')}<input type="date" name="pose_date" required></div></label>
              <label class="clients-field"><span>Heure de début</span><div class="clients-input-shell">${clientPageIcon('calendar')}<input type="time" name="start_time" required></div></label>
              <label class="clients-field"><span>Heure de fin</span><div class="clients-input-shell">${clientPageIcon('calendar')}<input type="time" name="end_time" required></div></label>
              <label class="clients-field modern-client-order-agenda-field-wide"><span>Lieu / adresse (facultatif)</span><div class="clients-input-shell">${clientPageIcon('location')}<input name="place" placeholder="Adresse de pose"></div></label>
              <label class="clients-field modern-client-order-agenda-field-wide"><span>Note (facultatif)</span><div class="clients-input-shell">${clientPageIcon('tasks')}<input name="note" placeholder="Infos chantier / équipe"></div></label>
            </div>
            <div class="modern-form-actions modern-client-order-agenda-actions"><button type="submit" class="clients-submit-btn">Valider</button></div>
          </form>
        </details>`}
      </section>` : ''}

      <div class="modern-client-order-actions modern-client-order-actions-bottom">
        <a class="modern-client-order-open" href="${card.folderUrl}">${clientPageIcon('folder', 'modern-client-order-open-icon')}<span>Ouvrir</span><b aria-hidden="true">›</b></a>
        <a class="modern-client-order-open modern-client-order-hours-link" href="${card.hoursUrl}">${pcFolderIcon('Heure chantier', 'modern-client-order-open-icon')}<span>Heures</span><b aria-hidden="true">›</b></a>
        <button type="button" class="modern-client-order-open modern-client-order-edit-trigger" aria-expanded="false" aria-controls="order-edit-${order.id}" data-order-edit-toggle>${clientPageIcon('edit', 'modern-client-order-open-icon')}<span>Modifier</span><b aria-hidden="true">›</b></button>
        <form method="POST" action="/orders/client/done" onsubmit="return confirm('Terminer cette commande ?');">
          <input type="hidden" name="id" value="${order.id}" />
          <button type="submit" class="modern-order-done-btn" aria-label="Terminer la commande" title="Terminer la commande">✅</button>
        </form>
      </div>

      <form method="POST" action="/orders/client/${order.id}/update" id="order-edit-${order.id}" class="modern-client-order-edit-form" data-order-edit-form hidden onsubmit="const b=this.querySelector('[type=submit]'); if (b && b.disabled) return false; if (b) b.disabled = true;">
        <div class="modern-client-order-edit-note">
          <strong>Nom verrouillé</strong><span>${escHtml(order.description || `Commande #${order.id}`)}</span><small>Utilisé par le dossier physique.</small>
        </div>
        <div class="modern-client-order-edit-grid">
          <label class="clients-field"><span>Date commande</span><div class="clients-input-shell">${clientPageIcon('calendar')}<input type="date" name="date" value="${escHtml(card.dateLabel)}"></div></label>
          ${!isWorkshop ? `
          <label class="clients-field"><span>Prix HT (€)</span><div class="clients-input-shell">${clientPageIcon('postal')}<input type="number" name="price" step="0.01" min="0" value="${escHtml(card.editPriceValue)}" data-order-edit-price-ht></div></label>
          <label class="clients-field"><span>TVA</span><div class="clients-input-shell">${clientPageIcon('postal')}<select name="vat_rate" data-order-edit-vat-rate>${editVatOptions}</select></div></label>
          <label class="clients-field"><span>Prix TTC (€)</span><div class="clients-input-shell">${clientPageIcon('postal')}<input type="number" step="0.01" readonly data-order-edit-price-ttc></div></label>` : ''}
          <label class="clients-field"><span>Heures prévues</span><div class="clients-input-shell">${clientPageIcon('calendar')}<input type="number" name="planned_hours" min="0" step="0.25" value="${card.plannedHours > 0 ? escHtml(String(card.plannedHours)) : ''}"></div></label>
          <label class="clients-field"><span>Date fin prévue</span><div class="clients-input-shell">${clientPageIcon('calendar')}<input type="date" name="chantier_end_date" value="${escHtml(card.plannedEndDate || '')}"></div></label>
          <label class="clients-field"><span>Étape chantier</span><div class="clients-input-shell">${clientPageIcon('database')}<select name="chantier_status">${chantierStatusOptions(card.chantierStatus)}</select></div></label>
          <label class="clients-field"><span>Avancement (%)</span><div class="clients-input-shell">${clientPageIcon('tasks')}<input type="number" name="chantier_progress" min="0" max="100" step="1" value="${escHtml(String(Number(order.chantier_progress || card.progress || 0)))}"></div></label>
          ${!isWorkshop ? `<label class="clients-field"><span>Devis lié</span><div class="clients-input-shell">${clientPageIcon('quotes')}<select name="quote_id">${renderQuoteOptions(availableQuotes, order.quote_id, escHtml)}</select></div></label>` : ''}
        </div>
        <div class="modern-client-order-edit-actions">
          <button type="submit" class="clients-submit-btn">${clientPageIcon('check', 'clients-submit-icon')} Enregistrer</button>
          <button type="button" class="modern-cancel-link" data-order-edit-cancel>Annuler</button>
        </div>
      </form>
    </article>`;
}

module.exports = { renderClientOrderCard, renderQuoteOptions };
