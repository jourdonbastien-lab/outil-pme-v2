'use strict';
function renderClientOrderInvoicesView(data) {
  const { mode = 'folder', orderDb, invoices = [], snapshot, client, order, type = 'Factures', fileName,
    alreadyAnalyzed, escapeHtml, formatEuroFr, clientPageIcon, pcFolderIcon } = data;
  if (mode === 'fileAction') {
    if (!orderDb) return '';
    if (alreadyAnalyzed) return '<span class="pc-modern-badge">Déjà analysée</span>';
    return `
      <form method="POST" action="/orders/client/${orderDb.id}/invoices/analyze-existing" class="pc-modern-inline-form">
        <input type="hidden" name="invoice_file_name" value="${escapeHtml(fileName)}" />
        <button class="pc-modern-open" type="submit">Analyser</button>
      </form>
    `;
  }
  if (!orderDb) return `
    <section class="pc-modern-panel">
      <div class="modern-section-title">
        ${pcFolderIcon('Factures', 'clients-title-icon')}
        <div><h2>Factures EBP</h2><p>Commande non retrouvée en base, scan indisponible.</p></div>
      </div>
    </section>
  `;
  const cards = invoices.length ? invoices.map((invoice) => {
    const openUrl = `/pc-file/${encodeURIComponent(client)}/${encodeURIComponent(order)}/${encodeURIComponent(type)}/${encodeURIComponent(invoice.stored_file_name || '')}`;
    return `
      <article class="order-purchase-card">
        <div class="order-purchase-main"><div>
          <h3>${escapeHtml(invoice.invoice_number || 'Facture sans numero')}</h3>
          <p><span>${escapeHtml(invoice.invoice_date || 'Date inconnue')}</span><span>${escapeHtml(formatEuroFr(invoice.amount_ht || 0))} HT</span><span>${escapeHtml(formatEuroFr(invoice.vat_amount || 0))} TVA</span><span>${escapeHtml(formatEuroFr(invoice.amount_ttc || 0))} TTC</span></p>
          <small>${escapeHtml(invoice.original_file_name || invoice.stored_file_name || '')}</small>
        </div></div>
        ${invoice.stored_file_name ? `<a class="modern-cancel-link" href="${openUrl}" target="_blank">Consulter</a>` : ''}
        <form method="POST" action="/orders/client/${orderDb.id}/invoices/${invoice.id}/delete" class="order-purchase-delete" onsubmit="return confirm('Supprimer cette facture ? Le reste a facturer sera recalcule.');">
          <button class="modern-danger-btn" type="submit">${clientPageIcon('trash', 'modern-action-icon')} Supprimer</button>
        </form>
      </article>
    `;
  }).join('') : '<div class="empty-state">Aucune facture EBP validée pour cette commande.</div>';
  return `
    <section class="pc-modern-panel">
      <div class="modern-section-title">
        ${pcFolderIcon('Factures', 'clients-title-icon')}
        <div><h2>Factures EBP</h2><p>Commande HT : ${escapeHtml(formatEuroFr(snapshot.revenue.expectedExVat))} · Déjà facturé : ${escapeHtml(formatEuroFr(snapshot.revenue.invoicedExVat))} · Reste : ${escapeHtml(formatEuroFr(snapshot.revenue.remainingToInvoiceExVat))}</p></div>
      </div>
      <form method="POST" action="/orders/client/${orderDb.id}/invoices/analyze" enctype="multipart/form-data" class="pc-modern-upload-form">
        <input type="file" name="invoice_file" accept="image/*,.pdf,application/pdf" required />
        <button class="clients-submit-btn" type="submit">Scanner une facture EBP</button>
      </form>
      <div class="order-purchase-list">${cards}</div>
    </section>
  `;
}
module.exports = { renderClientOrderInvoicesView };
