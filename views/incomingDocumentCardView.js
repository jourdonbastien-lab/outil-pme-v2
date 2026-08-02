'use strict';

function renderIncomingDocumentCard(doc, { escHtml, formatDateTimeLabel, formatFileSize, formatEuroFr, renderOptions, documentTypes }) {
  return `<article class="incoming-document-card">
    <header><div><span class="incoming-status is-${escHtml(doc.status)}">${escHtml(doc.status)}</span><h2>${escHtml(doc.original_name)}</h2><p>${formatDateTimeLabel(doc.received_at)} · ${formatFileSize(doc.file_size)} · ${escHtml(doc.source)}</p></div><strong>${doc.amount_ttc == null ? '—' : formatEuroFr(doc.amount_ttc)}</strong></header>
    <div class="incoming-document-meta"><span>Type <strong>${escHtml(doc.document_type.replaceAll('_', ' '))}</strong></span><span>Fournisseur <strong>${escHtml(doc.supplier_name || '—')}</strong></span><span>Numéro <strong>${escHtml(doc.document_number || '—')}</strong></span></div>
    ${doc.error_message ? `<p class="incoming-error">${escHtml(doc.error_message)}</p>` : ''}
    <div class="incoming-document-actions"><a class="modern-secondary-btn" href="/documents-entrants/${doc.id}/file">Ouvrir</a><a class="modern-secondary-btn" href="/documents-entrants/${doc.id}/file?download=1">Télécharger</a>
      <form method="POST" action="/documents-entrants/${doc.id}/reanalyze"><button class="modern-secondary-btn" type="submit">Relancer l’analyse</button></form>
      <details><summary class="clients-submit-btn">Classer</summary><form method="POST" action="/documents-entrants/${doc.id}/classify" class="incoming-classify-form">
        <label><span>Type</span><select name="document_type">${renderOptions(documentTypes, doc.document_type)}</select></label><label><span>Fournisseur</span><input name="supplier_name" maxlength="255" value="${escHtml(doc.supplier_name || '')}"></label><label><span>Numéro</span><input name="document_number" maxlength="120" value="${escHtml(doc.document_number || '')}"></label><label><span>Date</span><input type="date" name="document_date" value="${escHtml(doc.document_date || '')}"></label><label><span>HT</span><input name="amount_ht" inputmode="decimal" value="${doc.amount_ht ?? ''}"></label><label><span>TVA</span><input name="amount_tva" inputmode="decimal" value="${doc.amount_tva ?? ''}"></label><label><span>TTC</span><input name="amount_ttc" inputmode="decimal" value="${doc.amount_ttc ?? ''}"></label><label class="incoming-wide"><span>Notes</span><textarea name="notes">${escHtml(doc.notes || '')}</textarea></label><button class="clients-submit-btn incoming-wide" type="submit">Valider le classement</button></form></details>
      <form method="POST" action="/documents-entrants/${doc.id}/reject" onsubmit="return confirm('Rejeter ce document sans supprimer son fichier ?')"><input type="hidden" name="reason" value="Rejet manuel"><button class="modern-danger-btn" type="submit">Rejeter</button></form>
    </div></article>`;
}

module.exports = { renderIncomingDocumentCard };
