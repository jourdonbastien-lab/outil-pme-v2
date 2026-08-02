'use strict';

function renderSupplierOrderCard(item, context) {
  const { escHtml, clientPageIcon, purchaseStatusClass, redirect } = context;
  const isPurchase = item.type === 'purchase';
  const statusClass = isPurchase ? purchaseStatusClass(item.status) : item.status === 'Terminée' ? 'done' : 'ordered';
  return `
            <article class="supplier-purchase-card supplier-combined-card" id="${escHtml(item.key)}">
              <div class="supplier-purchase-context">
                <span class="supplier-source-badge ${isPurchase ? 'purchase' : 'supplier'}">${escHtml(item.sourceLabel)}</span>
                <strong>${escHtml(item.subtitle)}</strong>
              </div>
              <div class="supplier-purchase-main">
                <div>
                  <h3>${escHtml(item.title)}</h3>
                  <p>
                    ${item.meta.map((meta) => `<span>${escHtml(meta)}</span>`).join('')}
                  </p>
                </div>
                <span class="order-purchase-status ${statusClass}">${escHtml(item.status)}</span>
              </div>
              <div class="supplier-purchase-actions">
                <a class="supplier-purchase-link" href="${item.href}">${isPurchase ? 'Ouvrir chantier' : 'Ouvrir'}</a>
                ${isPurchase && item.status !== 'Commandé' ? `
                  <form method="POST" action="/orders/suppliers/purchases/${item.id}/status">
                    <input type="hidden" name="status" value="Commandé">
                    <input type="hidden" name="redirect" value="${escHtml(redirect)}">
                    <button type="submit">Marquer commandé</button>
                  </form>
                ` : ''}
                ${isPurchase && item.status !== 'Reçu' ? `
                  <form method="POST" action="/orders/suppliers/purchases/${item.id}/status">
                    <input type="hidden" name="status" value="Reçu">
                    <input type="hidden" name="redirect" value="${escHtml(redirect)}">
                    <button type="submit">Marquer reçu</button>
                  </form>
                ` : ''}
                ${!isPurchase && item.status !== 'Terminée' ? `
                  <form method="POST" action="/orders/suppliers/done">
                    <input type="hidden" name="id" value="${item.id}">
                    <button type="submit">Marquer terminé</button>
                  </form>
                ` : ''}
                ${!isPurchase ? `
                  <form method="POST" action="/orders/supplier/delete" onsubmit="return confirm('Supprimer cette commande ?');">
                    <input type="hidden" name="id" value="${item.id}">
                    <button class="modern-danger-btn" type="submit">${clientPageIcon('trash', 'modern-action-icon')} Supprimer</button>
                  </form>
                ` : ''}
              </div>
            </article>
          `;
}

module.exports = { renderSupplierOrderCard };
