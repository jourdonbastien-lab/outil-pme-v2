'use strict';

function renderQuotesListView(data) {
  const { quotes, escapeHtml, quoteStatusClass, clientPageIcon, infoBar } = data;
  const cards = quotes.length
    ? quotes.map((quote) => `
        <article class="quote-list-card">
          <a class="quote-list-link" href="/devis/${quote.id}" aria-label="Ouvrir le devis ${quote.id}"></a>
          <div class="quote-list-head">
            <span class="quote-number">#${quote.id}</span>
            <span class="quote-status-badge ${quoteStatusClass(quote.normalizedStatus)}">${escapeHtml(quote.normalizedStatus)}</span>
          </div>
          <h2>${escapeHtml(quote.displayTitle)}</h2>
          <div class="quote-list-client">${escapeHtml(quote.displayClientName)}</div>
          <div class="quote-list-meta">
            <span>Date : ${escapeHtml(quote.displayDate)}</span>
            <span>HT : ${quote.totalHt.toFixed(2)} €</span>
            <span>TTC : ${quote.totalTtc.toFixed(2)} €</span>
          </div>
          <div class="quote-list-footer">
            <strong>${quote.totalTtc.toFixed(2)} € TTC</strong>
            <span class="dash-card-button">Ouvrir</span>
          </div>
        </article>
      `).join('')
    : `<div class="empty-state">Aucun devis</div>`;

  return `
      <div class="page-head quote-page-head app-dark-page-head">
        <div class="clients-create-head">
          ${clientPageIcon('quotes', 'clients-title-icon')}
          <div>
            <h1>Devis</h1>
            <span>${quotes.length} devis au total</span>
          </div>
        </div>
        <a class="btn btn-primary" href="/devis/new">+ Nouveau devis</a>
      </div>

      ${infoBar(
        `<div class="kpi"><div class="kpi-label">Devis</div><div class="kpi-value">${quotes.length}</div></div>`,
        ''
      )}

      <section class="quote-list-grid">${cards}</section>
      `;
}

module.exports = { renderQuotesListView };
