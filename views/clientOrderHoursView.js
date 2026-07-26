'use strict';

function renderClientOrderHoursView(data) {
  const {
    client, order, orderId, rows, totalMinutes, last7Minutes, plannedHours,
    diffHours, isOver, isAtelier, today, escapeHtml: escHtml,
    formatMinutes: fmtMinutes, formatDurationLabel, clientPageIcon, pcFolderIcon
  } = data;
  const hasOrderId = Number(orderId) > 0;
  const listHtml = rows.length
    ? `<div class="pc-modern-hours-grid">${rows.map((row) => `
        <article class="pc-modern-hour-card">
          <header><strong>${escHtml(row.work_date)}</strong><span>${escHtml(formatDurationLabel(row.minutes_total || 0))}</span></header>
          <div class="pc-modern-hour-meta">
            <span>Durée <strong>${escHtml(formatDurationLabel(row.minutes_total || 0))}</strong></span>
            <span>Catégorie <strong>${escHtml(row.category || 'autre')}</strong></span>
          </div>
          ${row.note ? `<p>${escHtml(row.note)}</p>` : ''}
          <form method="POST" action="/chantier-hours/delete" onsubmit="return confirm('Supprimer cette ligne ?');" style="margin:0">
            <input type="hidden" name="id" value="${row.id}">
            <input type="hidden" name="client" value="${escHtml(client)}">
            <input type="hidden" name="order" value="${escHtml(order)}">
            <button class="modern-danger-btn" title="Supprimer">${clientPageIcon('trash', 'modern-action-icon')} Supprimer</button>
          </form>
        </article>`).join('')}</div>`
    : '<div class="empty-state">Aucune heure saisie pour ce chantier.</div>';

  return `
    <div class="pc-modern-page">
      <section class="pc-modern-hero">
        <div><span>Dossier</span><h1>Heures chantier</h1><p>${escHtml(order)}</p></div>
        <div class="pc-modern-actions">
          <a class="modern-cancel-link" href="/pc-folders/${encodeURIComponent(client)}/${encodeURIComponent(order)}">Retour commande</a>
          <a class="modern-cancel-link" href="/pc-folders/${encodeURIComponent(client)}">Retour client</a>
          <a class="clients-submit-btn" href="/chantier-hours/export.csv?client=${encodeURIComponent(client)}&order=${encodeURIComponent(order)}${hasOrderId ? `&client_order_id=${encodeURIComponent(String(orderId))}` : ''}">Export CSV</a>
        </div>
      </section>
      <section class="pc-modern-panel">
        <div class="chantier-hours-grid">
          <div><span>Total chantier</span><strong>${fmtMinutes(totalMinutes)}</strong></div>
          <div><span>7 derniers jours</span><strong>${fmtMinutes(last7Minutes)}</strong></div>
          ${!isAtelier ? `
            <div><span>Heures prévues</span><strong>${plannedHours.toFixed(1)} h</strong></div>
            <div><span>Écart</span><strong class="${isOver ? 'chantier-over' : ''}">${diffHours >= 0 ? '+' : ''}${diffHours.toFixed(1)} h</strong></div>` : ''}
        </div>
        ${!isAtelier ? `
          <form method="POST" action="/chantier-hours/planned-hours" class="pc-modern-planned-form">
            <input type="hidden" name="client" value="${escHtml(client)}">
            <input type="hidden" name="order" value="${escHtml(order)}">
            ${hasOrderId ? `<input type="hidden" name="client_order_id" value="${orderId}">` : ''}
            <label>Heures prévues</label>
            <input type="number" step="0.5" name="planned_hours" value="${plannedHours}">
            <button class="clients-submit-btn" type="submit">Enregistrer</button>
          </form>` : ''}
      </section>
      <section class="pc-modern-panel">
        <div class="modern-section-title">
          ${pcFolderIcon('Heure chantier', 'clients-title-icon')}
          <div><h2>Ajouter une durée</h2></div>
        </div>
        <form method="POST" action="/chantier-hours/add" class="hours-form">
          <input type="hidden" name="client" value="${escHtml(client)}">
          <input type="hidden" name="order" value="${escHtml(order)}">
          ${hasOrderId ? `<input type="hidden" name="client_order_id" value="${orderId}">` : ''}
          <div class="hours-grid">
            <div class="field"><label>Date</label><input type="date" name="work_date" value="${today}" required></div>
            <div class="field"><label>Heures</label><input type="number" name="work_hours" min="0" step="1" inputmode="numeric" value="0" required data-chantier-hours-input></div>
            <div class="field"><label>Minutes</label><select name="work_minutes" required data-chantier-minutes-select>
              <option value="0">0</option><option value="15">15</option><option value="30">30</option><option value="45">45</option>
            </select></div>
            <div class="field"><label>Total</label><strong data-chantier-duration-total aria-live="polite">0 h</strong></div>
            <div class="field"><label>Catégorie</label><select name="category">
              <option value="atelier">Atelier</option><option value="etude">Étude</option><option value="pose">Pose</option>
              <option value="transport">Transport</option><option value="sav">SAV</option><option value="autre">Autre</option>
            </select></div>
            <div class="field field-wide"><label>Note</label><input name="note" placeholder="Ex: pose portail, soudure, déplacement…"></div>
            <div class="actions"><button class="clients-submit-btn" type="submit">Ajouter</button></div>
          </div>
        </form>
        <script>
          (function() {
            const form = document.querySelector('.hours-form');
            if (!form) return;
            const hoursInput = form.querySelector('[data-chantier-hours-input]');
            const minutesSelect = form.querySelector('[data-chantier-minutes-select]');
            const totalNode = form.querySelector('[data-chantier-duration-total]');
            if (!hoursInput || !minutesSelect || !totalNode) return;
            const updateTotal = () => {
              const hours = Math.max(0, parseInt(hoursInput.value || '0', 10) || 0);
              const minutes = parseInt(minutesSelect.value || '0', 10) || 0;
              const totalMinutes = (hours * 60) + minutes;
              totalNode.textContent = hours + ' h' + (minutes ? ' ' + String(minutes).padStart(2, '0') : '');
              totalNode.dataset.totalMinutes = String(totalMinutes);
            };
            hoursInput.addEventListener('input', updateTotal);
            minutesSelect.addEventListener('change', updateTotal);
            updateTotal();
          })();
        </script>
      </section>
      <section class="pc-modern-panel">
        <div class="modern-section-title">${pcFolderIcon('file', 'clients-title-icon')}<div><h2>Historique</h2></div></div>
        ${listHtml}
      </section>
    </div>`;
}

module.exports = { renderClientOrderHoursView };
