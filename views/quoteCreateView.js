'use strict';

function renderQuoteCreateView(data) {
  const { clients, quoteDate, escapeHtml, clientPageIcon } = data;
  const clientSelectOptions = [
    '<option value="">Nouveau prospect</option>',
    ...clients.map((client) => `<option value="${escapeHtml(client)}">${escapeHtml(client)}</option>`)
  ].join('');

  return `
      <div class="modern-page">
        <form method="POST" action="/devis" class="clients-create-card modern-form-card quote-create-form" id="quoteForm">
          <div class="clients-create-head">
            ${clientPageIcon('quotes', 'clients-title-icon')}
            <h1>Nouveau devis</h1>
          </div>

          <h2 class="modern-section-title">Informations du devis</h2>

          <div class="modern-form-grid">
            <label class="clients-field">
              <span>Client</span>
              <div class="clients-input-shell">
                ${clientPageIcon('user')}
                <select id="existing_client" name="existing_client">
                  ${clientSelectOptions}
                </select>
              </div>
            </label>

            <label class="clients-field">
              <span>Objet du devis *</span>
              <div class="clients-input-shell">
                ${clientPageIcon('postal')}
                <input name="title" required placeholder="Ex : Escalier quart tournant" />
              </div>
            </label>

            <label class="clients-field">
              <span>Date du devis</span>
              <div class="clients-input-shell">
                ${clientPageIcon('calendar')}
                <input name="quote_date" type="date" value="${quoteDate}" />
              </div>
            </label>

            <label class="clients-field">
              <span>Statut</span>
              <div class="clients-input-shell">
                ${clientPageIcon('database')}
                <select name="status" disabled>
                  <option>Brouillon</option>
                </select>
              </div>
            </label>
          </div>

          <h2 class="modern-section-title">Nouveau prospect</h2>

          <div class="modern-form-grid">
            <label class="clients-field">
              <span>Nom du prospect *</span>
              <div class="clients-input-shell">
                ${clientPageIcon('user')}
                <input name="prospect_name" id="prospect_name" placeholder="Nom du prospect" />
              </div>
            </label>

            <label class="clients-field">
              <span>Email</span>
              <div class="clients-input-shell">
                ${clientPageIcon('mail')}
                <input name="prospect_email" id="prospect_email" type="email" />
              </div>
            </label>

            <label class="clients-field">
              <span>Téléphone</span>
              <div class="clients-input-shell">
                ${clientPageIcon('phone')}
                <input name="prospect_phone" id="prospect_phone" />
              </div>
            </label>

            <label class="clients-field">
              <span>Adresse</span>
              <div class="clients-input-shell">
                ${clientPageIcon('location')}
                <input name="prospect_address" id="prospect_address" />
              </div>
            </label>
          </div>

          <div class="modern-form-actions">
            <button type="submit" class="clients-submit-btn">
              <span>${clientPageIcon('add', 'clients-submit-icon')}</span>
              Créer le devis
            </button>
            <a class="modern-cancel-link" href="/devis">Annuler</a>
          </div>
        </form>
      </div>

      <script>
      (function(){
        const existing = document.getElementById('existing_client');
        const pName  = document.getElementById('prospect_name');
        const pEmail = document.getElementById('prospect_email');
        const pPhone = document.getElementById('prospect_phone');
        const pAddr  = document.getElementById('prospect_address');

        function setProspectEnabled(enabled){
          [pName, pEmail, pPhone, pAddr].forEach(el => {
            if (!el) return;
            el.disabled = !enabled;
            if (!enabled) el.value = '';
          });
        }

        function sync(){
          const hasExisting = (existing && existing.value ? existing.value : '').trim().length > 0;
          setProspectEnabled(!hasExisting);
        }

        if (existing){
          existing.addEventListener('input', sync);
          existing.addEventListener('change', sync);
        }
        sync();
      })();
      </script>
      `;
}

module.exports = { renderQuoteCreateView };
