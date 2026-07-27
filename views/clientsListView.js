'use strict';

function renderClientsListView(data) {
  const { clients, clientCreateError, clientCreateOpen, escapeHtml, clientPageIcon, renderClientCard } = data;
  const cards = clients.length
    ? clients.map((client) => renderClientCard(client, { escapeHtml, clientPageIcon })).join('')
    : `<div class="empty-state">Aucun client</div>`;

  return `
      <div class="clients-page-modern">
        <form method="POST" action="/clients" class="clients-create-card clients-create-collapsible ${clientCreateOpen ? 'is-open' : 'is-collapsed'}" data-clients-create-card>
          <button type="button" class="clients-create-head clients-create-toggle" aria-expanded="${clientCreateOpen ? 'true' : 'false'}" aria-controls="client-create-panel" data-clients-create-toggle>
            <span class="clients-create-title">
              ${clientPageIcon('add', 'clients-title-icon')}
              <h1>Nouveau client</h1>
            </span>
            <span class="clients-create-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6"/></svg></span>
          </button>

          <div class="clients-create-panel" id="client-create-panel" ${clientCreateOpen ? '' : 'hidden'} data-clients-create-panel>
            ${clientCreateError ? `<p class="error">${escapeHtml(clientCreateError)}</p>` : ''}
            <div class="clients-form-grid">
              <label class="clients-field"><span>Nom *</span><div class="clients-input-shell">${clientPageIcon('user')}<input name="name" required placeholder="Nom du client" /></div></label>
              <label class="clients-field"><span>Email</span><div class="clients-input-shell">${clientPageIcon('mail')}<input name="email" type="email" placeholder="client@email.com" /></div></label>
              <label class="clients-field clients-field-wide"><span>Adresse</span><div class="clients-input-shell">${clientPageIcon('location')}<input name="address" placeholder="Adresse" /></div></label>
              <label class="clients-field"><span>Code postal</span><div class="clients-input-shell">${clientPageIcon('postal')}<input name="postal_code" placeholder="00000" /></div></label>
              <label class="clients-field"><span>Ville</span><div class="clients-input-shell">${clientPageIcon('building')}<input name="city" placeholder="Ville" /></div></label>
              <label class="clients-field"><span>Téléphone</span><div class="clients-input-shell">${clientPageIcon('phone')}<input name="phone" placeholder="06…" /></div></label>
            </div>
            <button class="clients-submit-btn" type="submit"><span>${clientPageIcon('add', 'clients-submit-icon')}</span>Ajouter le client</button>
          </div>
        </form>

        <section class="clients-list-card">
          <div class="clients-list-head"><div><h2>Clients</h2><span>${clients.length} au total</span></div><strong>${clients.length}</strong></div>
          <div class="clients-search-shell">${clientPageIcon('search')}<input id="clientSearch" class="search" placeholder="Rechercher un client…" autocomplete="off" /></div>
        </section>

      <section class="cards-grid" id="clientsGrid">${cards}</section>
      </div>

      <script>
        (function(){
          const createCard = document.querySelector('[data-clients-create-card]');
          if (createCard) {
            const toggle = createCard.querySelector('[data-clients-create-toggle]');
            const panel = createCard.querySelector('[data-clients-create-panel]');
            if (toggle && panel) {
              toggle.addEventListener('click', function(){
                const isOpen = toggle.getAttribute('aria-expanded') === 'true';
                toggle.setAttribute('aria-expanded', String(!isOpen));
                if (isOpen) {
                  createCard.classList.remove('is-open');
                  createCard.classList.add('is-collapsed');
                  panel.hidden = true;
                } else {
                  panel.hidden = false;
                  window.requestAnimationFrame(function(){
                    createCard.classList.add('is-open');
                    createCard.classList.remove('is-collapsed');
                  });
                }
              });
            }
          }

          const input = document.getElementById('clientSearch');
          const cards = document.querySelectorAll('.client-card-modern');
          if (!input) return;
          input.addEventListener('input', function(){
            const q = (this.value||'').toLowerCase();
            cards.forEach(card => {
              const name = card.textContent.toLowerCase();
              card.style.display = name.includes(q) ? '' : 'none';
            });
          });
        })();
      </script>
      `;
}

module.exports = { renderClientsListView };
