'use strict';

function renderClientOrderInvoiceValidationView(data) {
  const {
    order, warning, sourceType, scanFileName, existingFileName, scanOriginalName,
    fields, amountHt, vatAmount, amountTtc, cancelUrl, defaultInvoiceDate,
    escapeHtml: escHtml, clientPageIcon
  } = data;
  return `
    <div class="modern-page modern-client-orders-page">
      <section class="modern-list-head modern-client-orders-head">
        <div class="clients-create-head">
          ${clientPageIcon('quotes', 'clients-title-icon')}
          <div><h1>Validation facture EBP</h1><span>Commande cible : ${escHtml(order.description || `Commande #${order.id}`)} - ${escHtml(order.name || '')}</span></div>
        </div>
      </section>
      <section class="clients-create-card modern-form-card modern-client-order-form">
        ${warning ? `<p class="info">${escHtml(warning)}</p>` : ''}
        <form method="POST" action="/orders/client/${order.id}/invoices/create" class="modern-client-order-add-form">
          <input type="hidden" name="source_type" value="${escHtml(sourceType)}" />
          <input type="hidden" name="scan_file" value="${escHtml(scanFileName)}" />
          <input type="hidden" name="existing_file" value="${escHtml(existingFileName)}" />
          <input type="hidden" name="scan_original_name" value="${escHtml(scanOriginalName || scanFileName)}" />
          <div class="modern-form-grid">
            <label class="clients-field"><span>Numero facture</span><div class="clients-input-shell">${clientPageIcon('quotes')}<input name="invoice_number" value="${escHtml(fields.invoice_number || '')}" /></div></label>
            <label class="clients-field"><span>Date facture</span><div class="clients-input-shell">${clientPageIcon('calendar')}<input type="date" name="invoice_date" value="${escHtml(fields.invoice_date || defaultInvoiceDate)}" /></div></label>
            <label class="clients-field"><span>Client detecte</span><div class="clients-input-shell">${clientPageIcon('user')}<input name="client_name" value="${escHtml(fields.client_name || order.name || '')}" /></div></label>
            <label class="clients-field"><span>Montant HT</span><div class="clients-input-shell">${clientPageIcon('postal')}<input name="amount_ht" type="number" step="0.01" value="${escHtml(amountHt)}" required /></div></label>
            <label class="clients-field"><span>TVA</span><div class="clients-input-shell">${clientPageIcon('postal')}<input name="vat_amount" type="number" step="0.01" value="${escHtml(vatAmount)}" /></div></label>
            <label class="clients-field"><span>Montant TTC</span><div class="clients-input-shell">${clientPageIcon('postal')}<input name="amount_ttc" type="number" step="0.01" value="${escHtml(amountTtc)}" /></div></label>
          </div>
          <div class="modern-form-actions">
            <button type="submit" class="clients-submit-btn"><span>${clientPageIcon('check', 'clients-submit-icon')}</span> Valider la facture</button>
            <a class="modern-cancel-link" href="${cancelUrl}">Annuler</a>
          </div>
        </form>
      </section>
    </div>`;
}

module.exports = { renderClientOrderInvoiceValidationView };
