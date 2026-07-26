'use strict';

function renderClientOrdersListView(data) {
  const { orders, isAtelier, totalAmount, formatEuroFr, clientPageIcon, poseAgendaFlash,
    orderUpdateFlash, orderUpdateStatus, escapeHtml: escHtml, preClient,
    chantierStatusOptions, quoteOptions, pcFoldersOptions, cards } = data;
  return `
      <div class="modern-page modern-client-orders-page">
        <section class="modern-list-head modern-client-orders-head">
          <div class="clients-create-head">
            ${clientPageIcon('folder', 'clients-title-icon')}
            <div>
              <h1>Commandes clients</h1>
              <span>${orders.length} commande${orders.length > 1 ? 's' : ''} en cours${!isAtelier ? ` · Reste total a facturer HT : ${formatEuroFr(totalAmount)}` : ''}</span>
            </div>
          </div>
        </section>

        ${poseAgendaFlash ? `<section class="clients-create-card modern-form-card"><p class="info">${escHtml(poseAgendaFlash)}</p></section>` : ''}
        ${orderUpdateFlash ? `<section class="clients-create-card modern-form-card"><p class="${orderUpdateStatus === 'ok' ? 'info' : 'error'}">${escHtml(orderUpdateFlash)}</p></section>` : ''}

        <section class="clients-create-card modern-form-card modern-client-order-form modern-client-order-add-card is-collapsed" id="new-client-order" data-client-order-add-card>
          <button type="button" class="modern-client-order-add-toggle" aria-expanded="false" aria-controls="client-order-add-panel" data-client-order-add-toggle>
            <span class="modern-client-order-add-title">
              ${clientPageIcon('add', 'clients-title-icon')}
              <h2>Nouvelle commande</h2>
            </span>
            <span class="modern-client-order-add-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6"/></svg></span>
          </button>

          <div class="modern-client-order-add-panel" id="client-order-add-panel" hidden data-client-order-add-panel>
            <form method="POST" action="/orders/client" class="modern-client-order-add-form">
              <div class="modern-form-grid">
                <label class="clients-field">
                  <span>Client</span>
                  <div class="clients-input-shell">
                    ${clientPageIcon('user')}
                    <input list="pc-clients" name="name" placeholder="Nom du client ou dossier PC" required value="${escHtml(preClient)}" />
                  </div>
                </label>

                <label class="clients-field">
                  <span>Nom / objet commande</span>
                  <div class="clients-input-shell">
                    ${clientPageIcon('folder')}
                    <input name="description" placeholder="Ex : Escalier, portail, garde-corps" />
                  </div>
                </label>

                <label class="clients-field">
                  <span>Statut commande</span>
                  <div class="clients-input-shell">
                    ${clientPageIcon('database')}
                    <select disabled>
                      <option>En cours</option>
                    </select>
                  </div>
                </label>

                <label class="clients-field">
                  <span>Statut chantier</span>
                  <div class="clients-input-shell">
                    ${clientPageIcon('database')}
                    <select name="chantier_status">${chantierStatusOptions('À préparer')}</select>
                  </div>
                </label>

                <label class="clients-field">
                  <span>Heures prévues</span>
                  <div class="clients-input-shell">
                    ${clientPageIcon('calendar')}
                    <input type="number" name="planned_hours" min="0" step="0.25" placeholder="0" />
                  </div>
                </label>

                <label class="clients-field">
                  <span>Date commande</span>
                  <div class="clients-input-shell">
                    ${clientPageIcon('calendar')}
                    <input type="date" name="date" />
                  </div>
                </label>

                <label class="clients-field">
                  <span>Date début</span>
                  <div class="clients-input-shell">
                    ${clientPageIcon('calendar')}
                    <input type="date" name="chantier_start_date" />
                  </div>
                </label>

                <label class="clients-field">
                  <span>Date fin prévue</span>
                  <div class="clients-input-shell">
                    ${clientPageIcon('calendar')}
                    <input type="date" name="chantier_end_date" />
                  </div>
                </label>

                ${!isAtelier ? `<label class="clients-field"><span>Devis lié (facultatif)</span><div class="clients-input-shell">${clientPageIcon('quotes')}<select name="quote_id">${quoteOptions()}</select></div></label>` : ''}

                ${!isAtelier ? `
                <label class="clients-field">
                  <span>Prix HT (€)</span>
                  <div class="clients-input-shell">
                    ${clientPageIcon('postal')}
                    <input type="number" name="price" step="0.01" min="0" placeholder="0.00" data-order-price-ht />
                  </div>
                </label>
                <label class="clients-field">
                  <span>TVA</span>
                  <div class="clients-input-shell">
                    ${clientPageIcon('postal')}
                    <select name="vat_rate" data-order-vat-rate>
                      <option value="20" selected>TVA 20 %</option>
                      <option value="10">TVA 10 %</option>
                    </select>
                  </div>
                </label>
                <label class="clients-field">
                  <span>Prix TTC (€)</span>
                  <div class="clients-input-shell">
                    ${clientPageIcon('postal')}
                    <input type="number" step="0.01" placeholder="0.00" readonly data-order-price-ttc />
                  </div>
                </label>
                ` : ''}
              </div>

              <div class="modern-form-actions">
                <button type="submit" class="clients-submit-btn">
                  <span>${clientPageIcon('add', 'clients-submit-icon')}</span>
                  Créer la commande
                </button>
                <a class="clients-submit-btn" href="/orders/clients/scan-ebp">
                  <span>${clientPageIcon('quotes', 'clients-submit-icon')}</span>
                  Scanner devis EBP
                </a>
                <a class="clients-submit-btn" href="/orders/clients/incoming-ebp">
                  <span>${clientPageIcon('folder', 'clients-submit-icon')}</span>
                  Devis EBP à traiter
                </a>
                <a class="modern-cancel-link" href="/clients">Voir clients</a>
              </div>

              <datalist id="pc-clients">${pcFoldersOptions}</datalist>
            </form>
          </div>
        </section>

        <section class="orders-cards-section modern-client-orders-section">
          <div class="modern-client-orders-grid">${cards}</div>
        </section>
      </div>
      <script>
        (function(){
          var card = document.querySelector('[data-client-order-add-card]');
          if (!card) return;
          var toggle = card.querySelector('[data-client-order-add-toggle]');
          var panel = card.querySelector('[data-client-order-add-panel]');
          if (!toggle || !panel) return;
          var priceHt = card.querySelector('[data-order-price-ht]');
          var vatRate = card.querySelector('[data-order-vat-rate]');
          var priceTtc = card.querySelector('[data-order-price-ttc]');
          function syncOrderTtc(){
            if (!priceHt || !vatRate || !priceTtc) return;
            var ht = Number(String(priceHt.value || '').replace(',', '.'));
            var rate = Number(vatRate.value || 20);
            priceTtc.value = Number.isFinite(ht) && ht > 0 ? (ht * (1 + rate / 100)).toFixed(2) : '';
          }
          if (priceHt && vatRate && priceTtc) {
            priceHt.addEventListener('input', syncOrderTtc);
            vatRate.addEventListener('change', syncOrderTtc);
            syncOrderTtc();
          }
          document.querySelectorAll('[data-order-edit-form]').forEach(function(form){
            var editPriceHt = form.querySelector('[data-order-edit-price-ht]');
            var editVatRate = form.querySelector('[data-order-edit-vat-rate]');
            var editPriceTtc = form.querySelector('[data-order-edit-price-ttc]');
            function syncEditTtc(){
              if (!editPriceHt || !editVatRate || !editPriceTtc) return;
              var ht = Number(String(editPriceHt.value || '').replace(',', '.'));
              var rate = Number(editVatRate.value || '');
              editPriceTtc.value = Number.isFinite(ht) && ht > 0 && (rate === 10 || rate === 20)
                ? (ht * (1 + rate / 100)).toFixed(2)
                : '';
            }
            if (editPriceHt && editVatRate && editPriceTtc) {
              editPriceHt.addEventListener('input', syncEditTtc);
              editVatRate.addEventListener('change', syncEditTtc);
              syncEditTtc();
            }
          });
          document.querySelectorAll('[data-order-edit-toggle]').forEach(function(toggle){
            var panel = document.getElementById(toggle.getAttribute('aria-controls') || '');
            if (!panel) return;
            toggle.addEventListener('click', function(){
              var isOpen = toggle.getAttribute('aria-expanded') === 'true';
              toggle.setAttribute('aria-expanded', String(!isOpen));
              panel.hidden = isOpen;
            });
          });
          document.querySelectorAll('[data-order-edit-cancel]').forEach(function(button){
            button.addEventListener('click', function(){
              var panel = button.closest('[data-order-edit-form]');
              if (!panel) return;
              panel.hidden = true;
              var toggle = document.querySelector('[data-order-edit-toggle][aria-controls="' + panel.id + '"]');
              if (toggle) toggle.setAttribute('aria-expanded', 'false');
            });
          });
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

module.exports = { renderClientOrdersListView };
