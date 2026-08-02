'use strict';

function renderSupplierOrdersListView(data, dependencies) {
  const {
    orders, activeCount, chantierPurchases, statusFilter, supplierFilter,
    combinedSupplierItems, supplierChoices, query
  } = data;
  const { escHtml, clientPageIcon, purchaseStatusClass, renderSupplierOrderCard } = dependencies;
  const currentListUrl = () => {
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (supplierFilter !== 'all') params.set('supplier', supplierFilter);
    if (String(query.q || '').trim()) params.set('q', String(query.q).trim());
    const search = params.toString();
    return `/orders/suppliers${search ? `?${search}` : ''}#supplier-list`;
  };
  const supplierFilterOptions = [
    '<option value="all">Tous fournisseurs</option>',
    ...supplierChoices.map((supplier) => {
      const value = supplier ? supplier : '__missing';
      const label = supplier || 'Fournisseur non renseigné';
      return `<option value="${escHtml(value)}"${value === supplierFilter ? ' selected' : ''}>${escHtml(label)}</option>`;
    })
  ].join('');
  const statusFilterOptions = [
    ['all', 'Tous'], ['todo', 'À commander'], ['ordered', 'Commandés'], ['done', 'Reçus ou terminés']
  ].map(([value, label]) => `<option value="${escHtml(value)}"${value === statusFilter ? ' selected' : ''}>${escHtml(label)}</option>`).join('');
  const redirect = currentListUrl();
  const combinedSupplierCards = combinedSupplierItems.length
    ? combinedSupplierItems.map((item) => renderSupplierOrderCard(item, { escHtml, clientPageIcon, purchaseStatusClass, redirect })).join('')
    : '<div class="empty-state">Aucune commande fournisseur ou achat ne correspond aux filtres.</div>';
  return `
      <div class="modern-page supplier-modern-page">
        <section class="modern-list-head modern-client-orders-head supplier-modern-head">
          <div class="clients-create-head">
            ${clientPageIcon('supplierOrders', 'clients-title-icon')}
            <div>
              <h1>Commandes fournisseurs et achats</h1>
              <span>${orders.length} commande${orders.length > 1 ? 's' : ''} fournisseur · ${chantierPurchases.length} achat${chantierPurchases.length > 1 ? 's' : ''} chantier · ${activeCount} fournisseur${activeCount > 1 ? 's' : ''} en cours</span>
            </div>
          </div>
        </section>

        <section class="clients-create-card modern-form-card modern-client-order-form supplier-order-add-card is-collapsed" id="new-supplier-order" data-supplier-order-add-card>
          <button type="button" class="modern-client-order-add-toggle" aria-expanded="false" aria-controls="supplier-order-add-panel" data-supplier-order-add-toggle>
            <span class="modern-client-order-add-title">
              ${clientPageIcon('add', 'clients-title-icon')}
              <span>Nouvelle commande fournisseur</span>
            </span>
            <span class="modern-client-order-add-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6"/></svg></span>
          </button>

          <div class="modern-client-order-add-panel" id="supplier-order-add-panel" hidden data-supplier-order-add-panel>
            <form method="POST" action="/orders/supplier" class="modern-client-order-add-form">
              <div class="modern-form-grid supplier-modern-form-grid">
                <label class="clients-field">
                  <span>Nom</span>
                  <div class="clients-input-shell">
                    ${clientPageIcon('supplierOrders')}
                    <input name="name" required placeholder="Nom fournisseur ou commande" />
                  </div>
                </label>

                <label class="clients-field">
                  <span>Description</span>
                  <div class="clients-input-shell">
                    ${clientPageIcon('folder')}
                    <input name="description" placeholder="Ex : acier, quincaillerie, traitement" />
                  </div>
                </label>

                <label class="clients-field">
                  <span>Date</span>
                  <div class="clients-input-shell">
                    ${clientPageIcon('calendar')}
                    <input name="date" type="date" />
                  </div>
                </label>
              </div>

              <div class="modern-form-actions">
                <button type="submit" class="clients-submit-btn">
                  <span>${clientPageIcon('add', 'clients-submit-icon')}</span>
                  Créer la commande
                </button>
              </div>
            </form>
          </div>
        </section>

        <section class="supplier-purchases-section" id="supplier-list">
          <p class="supplier-list-summary">${combinedSupplierItems.length} élément${combinedSupplierItems.length > 1 ? 's' : ''} affiché${combinedSupplierItems.length > 1 ? 's' : ''}</p>
          <form method="GET" action="/orders/suppliers" class="supplier-purchase-filters">
            <label>
              <span>Statut</span>
              <select name="status" onchange="this.form.submit()">${statusFilterOptions}</select>
            </label>
            <label>
              <span>Fournisseur</span>
              <select name="supplier" onchange="this.form.submit()">${supplierFilterOptions}</select>
            </label>
            <label>
              <span>Recherche</span>
              <input name="q" value="${escHtml(String(query.q || ''))}" placeholder="Désignation, client, chantier, référence">
            </label>
            <button type="submit">Rechercher</button>
            <a href="/orders/suppliers#supplier-list">Réinitialiser</a>
          </form>
          <div class="supplier-purchase-list">
            ${combinedSupplierCards}
          </div>
        </section>
      </div>
      <script>
        (function(){
          var card = document.querySelector('[data-supplier-order-add-card]');
          if (!card) return;
          var toggle = card.querySelector('[data-supplier-order-add-toggle]');
          var panel = card.querySelector('[data-supplier-order-add-panel]');
          if (!toggle || !panel) return;
          toggle.addEventListener('click', function(){
            var isOpen = toggle.getAttribute('aria-expanded') === 'true';
            toggle.setAttribute('aria-expanded', String(!isOpen));
            if (isOpen) {
              card.classList.remove('is-open');
              card.classList.add('is-collapsed');
              window.setTimeout(function(){
                if (toggle.getAttribute('aria-expanded') !== 'true') panel.hidden = true;
              }, 230);
            } else {
              panel.hidden = false;
              window.requestAnimationFrame(function(){
                card.classList.add('is-open');
                card.classList.remove('is-collapsed');
              });
            }
          });
        })();
      </script>
  `;
}

module.exports = { renderSupplierOrdersListView };
