'use strict';

function renderQuoteDetailView(data, dependencies) {
  const {
    id, quote, photos, materials, lines, total, acceptDisabled, marginPct, totalWithMargin,
    profitabilityContext, profitabilitySaved, profitabilityForecast, vatRate, tva, totalTtc,
    quoteStatus, linkedMeasurements
  } = data;
  const {
    escHtml, clientPageIcon, formatDateLabel, quoteStatusClass, quoteStatusOptions, quoteVatOptions,
    formatEuroFr, projectProfitability, renderQuoteMeasurementCreationLinks, renderMeasurementCards,
    renderSketchBlock
  } = dependencies;
  function parseJsonArray(value) {
    try { const parsed = JSON.parse(String(value || '[]')); return Array.isArray(parsed) ? parsed : []; }
    catch { return []; }
  }

  const photosHtml = photos.map(photo => {
    const fileUrl = `/quote-photos/${id}/${encodeURIComponent(photo)}`;
    const lower = photo.toLowerCase();
    const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(lower);
    return `
    <div class="quote-photo-card">
  
      ${
        isImage
          ? `<button type="button" class="quote-photo-open" data-quote-photo-url="${escHtml(fileUrl)}" data-quote-photo-title="${escHtml(photo)}" aria-label="Ouvrir ${escHtml(photo)}">
              <img src="${fileUrl}" class="quote-photo" alt="${escHtml(photo)}">
            </button>`
          : `<a href="${fileUrl}" target="_blank" rel="noopener">
              <span class="quote-file-preview">${clientPageIcon('quotes', 'quote-file-icon')}<strong>${escHtml(photo)}</strong></span>
            </a>`
      }
  
      <form method="POST"
            action="/devis/${id}/photo/delete"
            onsubmit="return confirm('Supprimer ce fichier ?');">
  
        <input
          type="hidden"
          name="photo"
          value="${escHtml(photo)}">
  
        <button
          type="submit"
          class="btn danger">
          Supprimer
        </button>
  
      </form>
  
    </div>
  `;
  }).join('');

  const rows = lines.length
      ? lines
          .map(
            (l) => `
        <tr>
          <td>${escHtml(l.category || '')}</td>
          <td>${escHtml(l.label || '')}</td>
          <td style="text-align:right">${Number(l.qty || 0).toFixed(2)}</td>
          <td>${escHtml(l.unit || '')}</td>
          <td style="text-align:right">${Number(l.unit_price || 0).toFixed(2)} €</td>
          <td style="text-align:right"><strong>${Number(l.total || 0).toFixed(2)} €</strong></td>
          <td style="text-align:center">
            <form method="POST" action="/devis/line/delete" onsubmit="return confirm('Supprimer cette ligne ?');" style="margin:0">
              <input type="hidden" name="quote_id" value="${id}">
              <input type="hidden" name="id" value="${l.id}">
              <button class="btn-icon danger" title="Supprimer">Supprimer</button>
            </form>
          </td>
        </tr>
      `
          )
          .join('')
      : `<tr><td colspan="7">Aucune ligne</td></tr>`;

  return `
      <div class="quote-work-page">
        <section class="quote-work-hero">
          <div class="quote-work-title">
            <div class="quote-work-title-head">
              ${clientPageIcon('quotes', 'clients-title-icon')}
              <div>
                <span class="quote-work-kicker">Devis #${id}</span>
                <h1>${escHtml(quote.title || 'Sans titre')}</h1>
                <div class="quote-work-meta">
                  <span>${clientPageIcon('user', 'quote-work-meta-icon')}${escHtml(quote.client_name || 'Client non renseigné')}</span>
                  <span>${clientPageIcon('calendar', 'quote-work-meta-icon')}${escHtml(formatDateLabel(quote.created_at))}</span>
                  <span class="quote-status-badge ${quoteStatusClass(quoteStatus)}">${escHtml(quoteStatus)}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="quote-work-actions">
            <a class="modern-cancel-link" href="/devis">Retour aux devis</a>
            <form method="POST" action="/devis/${id}/status" class="quote-work-status-form">
              <label>Statut</label>
              <select name="status">${quoteStatusOptions(quote.status)}</select>
              <button class="modern-secondary-btn" type="submit">Modifier</button>
            </form>
            <form
              method="POST"
              action="/devis/${id}/accept"
              onsubmit="return confirm('Accepter ce devis et créer la commande client ?');"
            >
              <button class="clients-submit-btn quote-accept-btn" ${acceptDisabled ? 'disabled' : ''}>
                ${acceptDisabled ? 'Devis accepté' : 'Accepter le devis'}
              </button>
            </form>
            <form
              method="POST"
              action="/devis/${id}/delete"
              onsubmit="return confirm('Supprimer définitivement ce devis ? Cette action est irréversible.');"
            >
              <button class="modern-danger-btn" type="submit">${clientPageIcon('trash', 'modern-action-icon')} Supprimer</button>
            </form>
          </div>
        </section>

        <section class="quote-finance-grid" aria-label="Résumé financier">
          <article class="quote-finance-card">
            <span>Total HT</span>
            <strong>${total.toFixed(2)} €</strong>
          </article>
          <article class="quote-finance-card quote-vat-card">
            <div class="quote-vat-card-head">
              <span>TVA ${vatRate}%</span>
              <form method="POST" action="/devis/${id}/vat" class="quote-vat-form">
                <select name="vat_rate" aria-label="Taux de TVA">${quoteVatOptions(vatRate)}</select>
                <button type="submit">OK</button>
              </form>
            </div>
            <strong>${tva.toFixed(2)} €</strong>
          </article>
          <article class="quote-finance-card quote-finance-card-total">
            <span>Total TTC</span>
            <strong>${totalTtc.toFixed(2)} €</strong>
          </article>
        </section>

        <section id="quote-ai-review-card" class="quote-ai-review-card" data-quote-ai-review data-quote-id="${id}">
          <header class="quote-ai-review-head">
            <span class="quote-ai-review-icon" aria-hidden="true">${clientPageIcon('search')}</span>
            <div><h2>Rentabilité prévisionnelle</h2><p>Calculs financiers serveur et points de vigilance métier.</p></div>
            <span class="quote-ai-risk-badge is-${profitabilityForecast.status}" data-ai-risk>${profitabilityForecast.status === 'incomplete' ? 'Données incomplètes' : profitabilityForecast.critical ? 'Rouge critique' : profitabilityForecast.status === 'green' ? 'Vert' : profitabilityForecast.status === 'orange' ? 'Orange' : 'Rouge'}</span>
          </header>
          <div class="profitability-overview">
            ${[
              ['Prix de vente HT', profitabilityForecast.totalHT, 'money'],
              ['Coût matière détecté', profitabilityForecast.materialCost, 'money'],
              ['Sous-traitance détectée', profitabilityForecast.subcontractingCost, 'money'],
              ['Main-d’œuvre détectée', profitabilityForecast.laborCost, 'money'],
              ['Autres coûts détectés', profitabilityForecast.otherDetectedCost, 'money'],
              ['Ajustements manuels', profitabilityForecast.adjustmentsCost, 'money'],
              ['Coût total prévisionnel', profitabilityForecast.totalCost, 'money'],
              ['Marge prévisionnelle', profitabilityForecast.margin, 'optionalMoney'],
              ['Marge sur coût', profitabilityForecast.marginOnCost, 'percent'],
              ['Marge sur vente', profitabilityForecast.marginOnSale, 'percent'],
              ['Niveau de fiabilité', ({complete:'Complet',partial:'Partiel',incomplete:'Incomplet'})[profitabilityForecast.reliability], 'text'],
              ['Lignes sans coût', `${profitabilityForecast.counts.missing} / ${profitabilityForecast.counts.total}`, 'text'],
              ['Vente sans coût associé', profitabilityForecast.missingSaleHT, 'money']
            ].map(([label, value, type]) => `<div data-profitability-metric="${escHtml(label)}"><span>${label}</span><strong>${type === 'money' ? formatEuroFr(value) : type === 'optionalMoney' ? (value == null ? 'Non renseigné' : formatEuroFr(value)) : type === 'percent' ? (value == null ? 'Non calculable' : `${Number(value).toFixed(2)} %`) : type === 'hours' ? `${Number(value).toFixed(2)} h` : escHtml(value)}</strong></div>`).join('')}
          </div>
          <section class="profitability-line-analysis"><h3>Analyse des lignes du devis</h3><div class="profitability-line-table" role="table">
            ${profitabilityForecast.lines.map((line) => `<article class="profitability-line-row is-${line.status}" role="row"><div><span>Libellé</span><strong>${escHtml(line.label || 'Sans libellé')}</strong></div><div><span>Catégorie</span><strong>${escHtml(line.category)}</strong></div><div><span>Vente HT</span><strong>${formatEuroFr(line.saleHT)}</strong></div><div><span>Coût détecté</span><strong>${line.cost == null ? 'Coût non renseigné' : formatEuroFr(line.cost)}</strong></div><div><span>Marge</span><strong>${line.margin == null ? 'Non calculable' : formatEuroFr(line.margin)}</strong></div><div><span>Statut</span><strong>${line.status === 'missing' ? 'À compléter' : line.status === 'loss' ? 'Déficitaire' : 'Analysée'}</strong><small>${escHtml(line.origin)}</small></div></article>`).join('') || '<p class="profitability-empty">Aucune ligne à analyser.</p>'}
          </div></section>
          <div class="profitability-price-targets">
            ${[[20, 'minimum', profitabilityForecast.minimumPrice], [30, 'conseillé', profitabilityForecast.targetPrice], [35, 'confortable', profitabilityForecast.comfortablePrice]].map(([rate, label, price]) => `<div><span>Prix ${label} — marge ${rate} %</span><strong>${price == null ? 'Non calculable' : formatEuroFr(price)}</strong><small>${price == null ? 'Chiffrage requis.' : totalWithMargin >= price ? `Votre prix actuel est supérieur de ${formatEuroFr(totalWithMargin - price)}.` : `Il manque ${formatEuroFr(price - totalWithMargin)} pour atteindre cet objectif.`}</small></div>`).join('')}
          </div>
          <div class="quote-ai-actions">
            <button type="button" class="modern-secondary-btn" data-profitability-edit>Ajustements manuels</button>
            <button type="button" class="clients-submit-btn" data-ai-analyze>Réanalyser le devis</button>
            <button type="button" class="modern-secondary-btn" data-ai-history>Afficher l’historique</button>
          </div>
          <p class="quote-ai-status" data-ai-status>Aucune analyse chargée.</p>
          <div class="quote-ai-report" data-ai-report hidden>
            <div class="quote-ai-report-columns">
              <section><h3>Alertes et points à vérifier</h3><ul data-ai-warnings></ul></section>
              <section><h3>Points positifs</h3><ul data-ai-positive></ul></section>
            </div>
            <section class="quote-ai-recommendation"><h3>Recommandation</h3><p data-ai-recommendation></p></section>
            <p class="quote-ai-provider" data-ai-provider></p>
          </div>
          <div class="quote-ai-history" data-ai-history-list hidden></div>
          <div class="quote-profitability-editor" data-profitability-editor hidden>
            <form class="quote-profitability-form" data-profitability-form>
              <section class="profitability-adjustments"><h3>Ajustements manuels</h3><p>Ajoutez uniquement un coût absent des lignes du devis. Les coûts détectés automatiquement ne sont jamais remplacés.</p>
                <div data-adjustment-list>${parseJsonArray(profitabilitySaved?.manual_adjustments_json).map((item) => `<div class="profitability-adjustment-row" data-adjustment-row><label><span>Type</span><select data-adjustment-type>${projectProfitability.LINE_COST_CATEGORIES.map((type) => `<option value="${escHtml(type)}" ${item.type === type ? 'selected' : ''}>${escHtml(type)}</option>`).join('')}</select></label><label><span>Libellé</span><input data-adjustment-label value="${escHtml(item.label || '')}" required></label><label><span>Montant HT</span><input data-adjustment-amount type="number" min="0.01" step="0.01" inputmode="decimal" value="${escHtml(String(item.amount || ''))}" required></label><button type="button" class="modern-danger-btn" data-adjustment-remove>Supprimer</button></div>`).join('')}</div>
                <template data-adjustment-template><div class="profitability-adjustment-row" data-adjustment-row><label><span>Type</span><select data-adjustment-type>${projectProfitability.LINE_COST_CATEGORIES.map((type) => `<option value="${escHtml(type)}">${escHtml(type)}</option>`).join('')}</select></label><label><span>Libellé</span><input data-adjustment-label required></label><label><span>Montant HT</span><input data-adjustment-amount type="number" min="0.01" step="0.01" inputmode="decimal" required></label><button type="button" class="modern-danger-btn" data-adjustment-remove>Supprimer</button></div></template>
                <button type="button" class="modern-secondary-btn" data-adjustment-add>Ajouter un ajustement</button>
              </section>
              ${(profitabilityContext.historicalCost || profitabilityContext.historicalForecastCosts?.totalCost) ? `<p class="profitability-legacy">Ancienne donnée globale disponible (${formatEuroFr(profitabilityContext.historicalForecastCosts?.totalCost || profitabilityContext.historicalCost)}). Conservée pour l’historique, elle n’est pas ajoutée au calcul automatique.</p>` : ''}
              <label class="profitability-notes"><span>Notes</span><textarea name="notes" rows="3">${escHtml(profitabilitySaved?.notes || '')}</textarea></label>
              <div class="quote-ai-actions"><button class="clients-submit-btn" type="submit">Enregistrer les ajustements</button><button class="modern-secondary-btn" type="button" data-profitability-cancel>Annuler</button></div>
              <p class="quote-ai-status" data-profitability-status></p>
            </form>
          </div>
          <p class="quote-ai-disclaimer">Cette analyse est une aide au contrôle. La validation finale du devis reste sous la responsabilité de l’utilisateur.</p>
        </section>

        <script>
        (function () {
          var root = document.querySelector('[data-quote-ai-review]');
          if (!root) return;
          var quoteId = root.dataset.quoteId;
          var analyze = root.querySelector('[data-ai-analyze]');
          var historyButton = root.querySelector('[data-ai-history]');
          var status = root.querySelector('[data-ai-status]');
          var report = root.querySelector('[data-ai-report]');
          var historyList = root.querySelector('[data-ai-history-list]');
          var risk = root.querySelector('[data-ai-risk]');
          var editor = root.querySelector('[data-profitability-editor]');
          var editButton = root.querySelector('[data-profitability-edit]');
          var profitabilityForm = root.querySelector('[data-profitability-form]');
          var euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
          function text(value, fallback) { return value == null ? fallback : String(value); }
          function percent(value) { return value == null ? 'Non calculée' : Number(value).toFixed(2) + ' %'; }
          function fillList(selector, values, empty) {
            var list = root.querySelector(selector); list.innerHTML = '';
            var items = Array.isArray(values) && values.length ? values : [empty];
            items.forEach(function (value) { var li = document.createElement('li'); li.textContent = value; list.appendChild(li); });
          }
          function renderReview(review) {
            var summary = review.summary || {};
            risk.hidden = false; risk.className = 'quote-ai-risk-badge is-' + text(review.riskLevel, 'orange');
            risk.textContent = ({ incomplete: 'Données incomplètes', green: 'Vert', orange: 'Orange', red: 'Rouge' })[review.riskLevel] || 'À vérifier';
            var values = [
              ['Prix HT', euro.format(Number(summary.totalHT || 0))],
              ['Coût de revient', summary.costPrice ? euro.format(Number(summary.costPrice)) : 'Non renseigné'],
              ['Marge', summary.marginAmount == null ? 'Non calculée' : euro.format(Number(summary.marginAmount))],
              ['Marge sur coût', percent(summary.marginOnCost)], ['Marge sur vente', percent(summary.marginOnSale)],
              ['Prix minimum 20 %', summary.minimumPrice == null ? 'Non calculable' : euro.format(Number(summary.minimumPrice))],
              ['Prix conseillé 30 %', summary.targetPrice == null ? 'Non calculable' : euro.format(Number(summary.targetPrice))],
              ['Prix confortable 35 %', summary.comfortablePrice == null ? 'Non calculable' : euro.format(Number(summary.comfortablePrice))]
            ];
            fillList('[data-ai-warnings]', review.warnings, 'Aucune alerte supplémentaire.');
            fillList('[data-ai-positive]', review.positivePoints, 'Aucun point positif calculable avec les données disponibles.');
            root.querySelector('[data-ai-recommendation]').textContent = text(review.recommendation, 'Vérification manuelle recommandée.');
            root.querySelector('[data-ai-provider]').textContent = text(review.ai && review.ai.message, 'Analyse automatique effectuée sans interprétation IA.');
            report.hidden = false;
            status.textContent = 'Dernière analyse : ' + (review.createdAt ? new Date(review.createdAt).toLocaleString('fr-FR') : 'maintenant');
          }
          async function loadHistory(show) {
            try {
              var response = await fetch('/api/devis/' + quoteId + '/ai-reviews'); var data = await response.json();
              if (!response.ok || !data.success) throw new Error(data.error || 'Historique indisponible');
              if (data.reviews && data.reviews[0] && report.hidden) renderReview(data.reviews[0]);
              if (show) {
                historyList.innerHTML = '';
                if (!data.reviews.length) historyList.textContent = 'Aucune analyse enregistrée.';
                data.reviews.forEach(function (review) { var button = document.createElement('button'); button.type = 'button'; button.className = 'quote-ai-history-item'; button.textContent = new Date(review.createdAt).toLocaleString('fr-FR') + ' · ' + text(review.riskLevel, '').toUpperCase(); button.addEventListener('click', function () { renderReview(review); }); historyList.appendChild(button); });
                historyList.hidden = false;
              }
            } catch (error) { if (show) status.textContent = error.message || 'Historique indisponible'; }
          }
          analyze.addEventListener('click', async function () {
            analyze.disabled = true; analyze.setAttribute('aria-busy', 'true'); status.textContent = 'Analyse en cours…';
            try {
              var response = await fetch('/api/devis/' + quoteId + '/profitability/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); var data = await response.json();
              if (!response.ok || !data.success) throw new Error(data.error || 'Analyse impossible');
              renderReview(data.review); historyList.hidden = true;
            } catch (error) { status.textContent = error.message || 'Analyse impossible'; }
            finally { analyze.disabled = false; analyze.removeAttribute('aria-busy'); }
          });
          historyButton.addEventListener('click', function () { loadHistory(true); });
          editButton.addEventListener('click', function () { editor.hidden = false; editButton.disabled = true; editor.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
          root.querySelector('[data-profitability-cancel]').addEventListener('click', function () { editor.hidden = true; editButton.disabled = false; });
          var adjustmentList = root.querySelector('[data-adjustment-list]'); var adjustmentTemplate = root.querySelector('[data-adjustment-template]');
          function bindAdjustmentRow(row) { var remove = row.querySelector('[data-adjustment-remove]'); if (remove) remove.addEventListener('click', function () { row.remove(); }); }
          adjustmentList.querySelectorAll('[data-adjustment-row]').forEach(bindAdjustmentRow);
          root.querySelector('[data-adjustment-add]').addEventListener('click', function () { var row = adjustmentTemplate.content.firstElementChild.cloneNode(true); adjustmentList.appendChild(row); bindAdjustmentRow(row); row.querySelector('input').focus(); });
          profitabilityForm.addEventListener('submit', async function (event) {
            event.preventDefault();
            var submit = profitabilityForm.querySelector('[type="submit"]'); var formStatus = root.querySelector('[data-profitability-status]');
            submit.disabled = true; formStatus.textContent = 'Enregistrement…';
            var body = { notes: new FormData(profitabilityForm).get('notes') || '', adjustments: [] };
            adjustmentList.querySelectorAll('[data-adjustment-row]').forEach(function (row) { body.adjustments.push({ type: row.querySelector('[data-adjustment-type]').value, label: row.querySelector('[data-adjustment-label]').value, amount: row.querySelector('[data-adjustment-amount]').value }); });
            try { var response = await fetch('/api/devis/' + quoteId + '/profitability', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); var data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Enregistrement impossible'); location.reload(); }
            catch (error) { formStatus.textContent = error.message || 'Enregistrement impossible'; submit.disabled = false; }
          });
          loadHistory(false);
        })();
        </script>

        <section class="quote-collapsible-section" id="quote-section-add-line" data-quote-collapsible>
          <button type="button" class="quote-collapsible-toggle" aria-expanded="false" aria-controls="quote-section-add-line-panel" data-quote-collapsible-toggle>
            <span class="quote-collapsible-title">
              ${clientPageIcon('add', 'quote-collapsible-icon')}
              <span>
                <strong>Ajouter une ligne / prestation</strong>
                <small>Matière, main-d'œuvre et calculateurs</small>
              </span>
            </span>
            <span class="quote-collapsible-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6"/></svg></span>
          </button>
          <div class="quote-collapsible-panel" id="quote-section-add-line-panel" hidden data-quote-collapsible-panel>
            <div class="quote-collapsible-content">
              <section class="quote-work-card quote-add-line-card quote-collapsible-inner-card">
          <div class="quote-add-grid">
            <article class="quote-cost-section">
              <header>
                ${clientPageIcon('database', 'quote-section-icon')}
                <div>
                  <h3>Matière</h3>
                  <p>Sélectionnez une matière pour remplir automatiquement l'unité et le prix.</p>
                </div>
              </header>

              <form method="POST" action="/devis/line" class="quote-line-modern-form" id="quickMatForm">
          <input type="hidden" name="quote_id" value="${id}">
          <input type="hidden" name="category" value="Matière">
          <input type="hidden" name="cost_category" id="quickMatCostCategory" value="matière acier">
          <input type="hidden" name="cost_unit" id="quickMatCostUnit" value="">
          <input type="hidden" name="cost_source" value="répertoire matières">

          <div class="quote-line-form-grid">
            <div class="modern-field field-wide">
              <label>Recherche matière</label>
              <div class="clients-input-shell">
                ${clientPageIcon('search')}
              <input
                id="quickMatLabel"
                name="label"
                list="materialsSuggest"
                class="search"
                placeholder="Tape: tube 40x40, tôle 5mm, HEA…"
                autocomplete="off"
                required
              />
              </div>
              <datalist id="materialsSuggest">
                ${materials
                  .map((m) => `<option value="${escHtml(m.name || '')}"></option>`)
                  .join('')}
              </datalist>

            </div>

            <div class="modern-field">
              <label>Qté</label>
              <div class="clients-input-shell">
                ${clientPageIcon('postal')}
              <input id="quickMatQty" name="qty" type="number" step="0.01" required placeholder="Ex: 6" />
              </div>
            </div>

            <div class="modern-field">
              <label>Unité</label>
              <div class="clients-input-shell">
                ${clientPageIcon('database')}
              <select id="quickMatUnit" name="unit" required>
                <option value="ml">ml</option>
                <option value="m²">m²</option>
                <option value="pièce">pièce</option>
                <option value="m">m</option>
                <option value="kg">kg</option>
                <option value="u">u</option>
              </select>
              </div>
            </div>

            <div class="modern-field">
              <label>Prix unitaire (€)</label>
              <div class="clients-input-shell">
                ${clientPageIcon('postal')}
              <input id="quickMatPU" name="unit_price" type="number" step="0.01" required placeholder="Ex: 12.50" />
              </div>
            </div>
<div class="modern-field">
  <label>Marge (%)</label>
  <div class="clients-input-shell">
    ${clientPageIcon('add')}
  <input id="matMargin" name="margin_pct" type="number" step="0.1" value="30">
  </div>
</div>
            <div class="quote-material-summary" id="quickMatSummary">
              <span>Matière sélectionnée</span>
              <strong id="quickMatSummaryName">Aucune matière</strong>
              <div>
                <small>Unité : <b id="quickMatSummaryUnit">—</b></small>
                <small>PU : <b id="quickMatSummaryPrice">—</b></small>
                <small>Total matière : <b id="quickMatSummaryTotal">—</b></small>
              </div>
            </div>
            <div class="modern-form-actions field-wide">
              <button type="submit" class="clients-submit-btn"><span>${clientPageIcon('add', 'clients-submit-icon')}</span>Ajouter au devis</button>
            </div>
          </div>
        </form>

        <script>
        (function(){
          const MAT_INDEX = new Map(
            ${JSON.stringify(
              materials.map(m => ({
                id: Number(m.id || 0),
                type: String(m.type || ''),
                name: String(m.name || ''),
                key: String((m.name || '')).trim().toLowerCase(),
                unit: String(m.unit || ''),
                price: Number(m.price || 0)
              }))
            )}.map(x => [x.key, x])
          );

     const label = document.getElementById('quickMatLabel');
const unit  = document.getElementById('quickMatUnit');
const pu    = document.getElementById('quickMatPU');
const margin = document.getElementById('matMargin');
const qty = document.getElementById('quickMatQty');
const summaryName = document.getElementById('quickMatSummaryName');
const summaryUnit = document.getElementById('quickMatSummaryUnit');
const summaryPrice = document.getElementById('quickMatSummaryPrice');
const summaryTotal = document.getElementById('quickMatSummaryTotal');
const costUnit = document.getElementById('quickMatCostUnit');
const costCategory = document.getElementById('quickMatCostCategory');

if (!label || !unit || !pu) return;

function normalizeMaterialUnit(value){
  const raw = String(value || '').trim();
  const key = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/\\s+/g, '');

  if (['m', 'ml', 'metre', 'meter', 'metres', 'meters'].includes(key)) return 'ml';
  if (['m2', 'm²', 'metrecarre', 'metrescarres', 'meter2', 'sqm'].includes(key)) return 'm²';
  if (['u', 'unite', 'unites', 'piece', 'pieces', 'pc', 'pcs'].includes(key)) return 'pièce';
  return raw;
}

function setMaterialUnit(value){
  const nextUnit = normalizeMaterialUnit(value);
  if (!nextUnit) return;

  const exists = Array.from(unit.options).some(option => option.value === nextUnit);
  if (!exists){
    unit.appendChild(new Option(nextUnit, nextUnit));
  }

  unit.value = nextUnit;
}

function updateMaterialSummary(found){
  const q = Number(qty?.value || 0);
  const p = Number(pu?.value || 0);
  if (summaryName) summaryName.textContent = found?.name || label.value || 'Aucune matière';
  if (summaryUnit) summaryUnit.textContent = unit.value || '—';
  if (summaryPrice) summaryPrice.textContent = p > 0 ? p.toFixed(2) + ' €' : '—';
  if (summaryTotal) summaryTotal.textContent = q > 0 && p > 0 ? (q * p).toFixed(2) + ' €' : '—';
}

function sync(){

  const k = (label.value || '').trim().toLowerCase();
  const found = MAT_INDEX.get(k);

  if (!found) {
    if (costUnit) costUnit.value = '';
    updateMaterialSummary(null);
    return;
  }

  if (found.unit){
    setMaterialUnit(found.unit);
  }

  if (Number.isFinite(found.price) && found.price > 0){
    if (costUnit) costUnit.value = found.price.toFixed(2);
    if (costCategory) {
      const descriptor = (found.type + ' ' + found.name).toLowerCase();
      costCategory.value = descriptor.includes('inox') ? 'inox' : descriptor.includes('alu') ? 'aluminium' : descriptor.includes('bois') ? 'bois' : 'matière acier';
    }

    const m = Number(margin?.value || 0);

    const salePrice =
      found.price * (1 + m / 100);

    pu.value = salePrice.toFixed(2);
  }

  updateMaterialSummary(found);
}

label.addEventListener('change', sync);
label.addEventListener('blur', sync);
unit.addEventListener('change', sync);
pu.addEventListener('input', sync);
if (qty) qty.addEventListener('input', sync);

if (margin){
  margin.addEventListener('input', sync);
}

sync();

})();
        </script>
            </article>
        

<details class="tool-box quote-support-tool">
  <summary>Calculateur de barres</summary>
  <h2>Calculateur de barres</h2>

  <div class="bar-calc">
    <div class="bar-calc-row">
      <label>Longueur barre standard (mm)</label>
      <input id="bar-length" type="number" value="6000">
    </div>

    <div class="bar-calc-row">
      <label>Perte par coupe (mm)</label>
      <input id="bar-loss" type="number" value="3">
    </div>

    <h4>Pièces à couper</h4>

    <table class="bar-table">
      <thead>
        <tr>
          <th>Longueur (mm)</th>
          <th>Quantité</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="cuts-body">
        <tr>
          <td><input type="number" min="1" value="1200"></td>
          <td><input type="number" min="1" value="1"></td>
          <td>
            <button type="button" onclick="removeBarRow(this)">Supprimer</button>
          </td>
        </tr>
      </tbody>
    </table>

    <div style="margin-top:10px">
      <button type="button" onclick="addBarRow()">Ajouter une coupe</button>
      <button type="button" class="btn primary" onclick="calculateBars()">Calculer</button>
      <button type="button" class="btn secondary" onclick="printCuts()">
  Imprimer les coupes
</button>
<script>
function printCuts() {
  const result = document.getElementById('bar-result');

  if (!result || !result.innerHTML.trim()) {
    alert('Aucun résultat à imprimer');
    return;
  }

  const win = window.open('', '', 'width=900,height=650');
  if (!win) {
    alert('Impossible d\'ouvrir la fenêtre d\'impression.');
    return;
  }

  const printHtml = \`
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Plan de coupe</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    h2 { text-align: center; margin-bottom: 15px; }
    .bar-box { border: 1px solid #000; padding: 10px; margin-bottom: 8px; }
  </style>
</head>
<body>
  <h2>Plan de coupe</h2>
  \${result.innerHTML}
</body>
</html>\`;

  win.document.open();
  win.document.write(printHtml);
  win.document.close();
  win.focus();
  win.print();
}
</script>

    </div>

    <div id="bar-result" class="bar-result" style="margin-top:12px"></div>
  </div>

<script>
function addBarRow() {
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input type="number" min="1" required></td>' +
    '<td><input type="number" min="1" value="1" required></td>' +
    '<td><button type="button" onclick="removeBarRow(this)">Supprimer</button></td>';

  document.getElementById('cuts-body').appendChild(tr);
}

function removeBarRow(btn) {
  btn.closest('tr').remove();
}


function removeRow(btn) {
  btn.closest('tr').remove();
}

function calculateBars() {
  const barLength = Number(document.getElementById('bar-length').value);
  const loss = Number(document.getElementById('bar-loss').value);

  if (!barLength || barLength <= 0) {
    alert('Longueur de barre invalide');
    return;
  }

  let cuts = [];

  document.querySelectorAll('#cuts-body tr').forEach(function(tr) {
    const len = Number(tr.children[0].querySelector('input').value);
    const qty = Number(tr.children[1].querySelector('input').value);

    if (!len || !qty) return;

    for (let i = 0; i < qty; i++) {
      cuts.push(len + loss);
    }
  });

  if (cuts.length === 0) {
    alert('Aucune coupe renseignée');
    return;
  }

  cuts.sort(function(a, b) {
    return b - a;
  });

  let bars = [];

  cuts.forEach(function(cut) {
    let placed = false;

    for (let i = 0; i < bars.length; i++) {
      if (bars[i].remaining >= cut) {
        bars[i].remaining -= cut;
        bars[i].cuts.push(cut);
        placed = true;
        break;
      }
    }

    if (!placed) {
      bars.push({
        remaining: barLength - cut,
        cuts: [cut]
      });
    }
  });

  let html = '<h4>Résultat</h4>';
  html += '<p><strong>' + bars.length + '</strong> barre(s) nécessaire(s)</p>';

  bars.forEach(function(bar, i) {
    html +=
      '<div class="bar-box">' +
      '<strong>Barre ' + (i + 1) + '</strong><br>' +
      'Coupes : ' + bar.cuts.map(function(c) { return c - loss; }).join(' + ') + '<br>' +
      'Reste : ' + bar.remaining + ' mm' +
      '</div>';
  });

  document.getElementById('bar-result').innerHTML = html;
}
</script>
</details>

<details class="tool-box quote-support-tool">
  <summary>Calculateur de tôles</summary>
  <h2>Calculateur de tôles</h2>

  <label>Largeur tôle</label>
  <input id="sheetW" type="number" value="3000">

  <label>Hauteur tôle</label>
  <input id="sheetH" type="number" value="1500">

  <label>Perte / jeu</label>
  <input id="gap" type="number" value="3">

  <table>
    <thead>
      <tr><th>L</th><th>H</th><th>Qté</th><th></th></tr>
    </thead>
    <tbody id="pieces">
      <tr>
        <td><input value="500"></td>
        <td><input value="300"></td>
        <td><input value="1"></td>
        <td><button onclick="removeSheetRow(this)">Supprimer</button></td>
      </tr>
    </tbody>
  </table>

  <button onclick="addSheetRow()">Ajouter une pièce</button>
  <button onclick="calculate()">Calculer</button>
 <button onclick="printPlan()">Imprimer</button>

<div id="result"></div>

<canvas
  id="canvas"
  width="900"
  height="500"
  style="border:1px solid #ccc">
</canvas>

<script>


function addSheetRow() {
  const tr = document.createElement('tr');

  tr.innerHTML =
    '<td><input></td>' +
    '<td><input></td>' +
    '<td><input value="1"></td>' +
    '<td><button onclick="removeSheetRow(this)">Supprimer</button></td>';

  document.getElementById('pieces').appendChild(tr);
}

function removeSheetRow(btn) {
  btn.closest('tr').remove();
}


function calculate() {
  const W = Number(document.getElementById('sheetW').value);
  const H = Number(document.getElementById('sheetH').value);
  const loss = Number(document.getElementById('gap').value);

  if (!W || !H) {
    alert('Dimensions de tôle invalides');
    return;
  }

  let pieces = [];

  document.querySelectorAll('#pieces tr').forEach(tr => {
    const w = Number(tr.children[0].firstElementChild.value);
    const h = Number(tr.children[1].firstElementChild.value);
    const q = Number(tr.children[2].firstElementChild.value);

    if (!w || !h || !q) return;

    for (let i = 0; i < q; i++) {
      pieces.push({ w: w + loss, h: h + loss });
    }
  });

  if (!pieces.length) {
    alert('Aucune pièce');
    return;
  }

  let sheets = [{ bands: [], used: 0 }];

  pieces.forEach(p => {
    let placed = false;

    for (let s of sheets) {
      for (let b of s.bands) {
        if (b.used + p.w <= W && b.h >= p.h) {
          b.items.push(p);
          b.used += p.w;
          placed = true;
          break;
        }
      }
      if (placed) break;

      if (s.used + p.h <= H) {
        s.bands.push({ h: p.h, used: p.w, items: [p] });
        s.used += p.h;
        placed = true;
        break;
      }
    }

    if (!placed) {
      sheets.push({
        bands: [{ h: p.h, used: p.w, items: [p] }],
        used: p.h
      });
    }
  });
  // Affichage du nombre de tôles
  document.getElementById('result').innerHTML =
    '<h4>' + sheets.length + ' tôle(s) nécessaire(s)</h4>';
  draw(sheets, W, H, loss);
}


function draw(sheets, W, H, loss) {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scale = Math.min(
    canvas.width / W,
    canvas.height / (H * sheets.length)
  );

  let offsetY = 10;

  sheets.forEach((sheet, i) => {
    ctx.strokeRect(10, offsetY, W * scale, H * scale);
    ctx.fillText('Tôle ' + (i + 1), 10, offsetY - 2);

    let y = offsetY;

    sheet.bands.forEach(band => {
      let x = 10;
      band.items.forEach(p => {
        ctx.fillStyle = '#cfe8ff';
        ctx.fillRect(x, y, (p.w - loss) * scale, (p.h - loss) * scale);
        ctx.strokeRect(x, y, (p.w - loss) * scale, (p.h - loss) * scale);
        ctx.fillStyle = '#000';
        ctx.fillText(
          (p.w - loss) + '×' + (p.h - loss),
          x + 4,
          y + 12
        );
        x += p.w * scale;
      });
      y += band.h * scale;
    });

    offsetY += H * scale + 20;
  });
}


function printPlan() {
  var canvas = document.getElementById('canvas');
  if (!canvas) {
    alert('Canvas introuvable');
    return;
  }

  var imgData = canvas.toDataURL('image/png');
  var result = document.getElementById('result').innerHTML;

  var w = window.open('', '', 'width=1000,height=700');
  if (!w) {
    alert('Impossible d\'ouvrir la fenêtre d\'impression.');
    return;
  }

  var printHtml = \`
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Plan de découpe tôles</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    img { max-width: 100%; border: 1px solid #000; }
  </style>
</head>
<body>
  <h2>Plan de découpe tôles</h2>
  \${result}
  <img src="\${imgData}" alt="Plan de découpe">
</body>
</html>\`;

  w.document.open();
  w.document.write(printHtml);
  w.document.close();
  w.focus();
  w.print();
}


</script>
</details>



            <article class="quote-cost-section">
              <header>
                ${clientPageIcon('user', 'quote-section-icon')}
                <div>
                  <h3>Main-d'œuvre et autres coûts</h3>
                  <p>Ajoutez une prestation, une pose, un traitement ou un forfait existant.</p>
                </div>
              </header>

  <form method="POST" action="/devis/line" class="quote-line-modern-form" id="prestForm">
    <input type="hidden" name="quote_id" value="${id}">
    <input type="hidden" name="category" value="Prestation">

    <div class="quote-line-form-grid">
      <div class="modern-field">
        <label>Type</label>
        <div class="clients-input-shell">
          ${clientPageIcon('database')}
        <select id="prest_type" name="cost_category" required>
          <option value="main-d’œuvre atelier">Main d’œuvre atelier</option>
          <option value="main-d’œuvre pose">Pose</option>
          <option value="sous-traitance">Laser / sous-traitance</option>
          <option value="galvanisation">Galvanisation</option>
          <option value="thermolaquage">Thermolaquage</option>
          <option value="matière acier">Matières</option>
          <option value="motorisation">Motorisation</option>
          <option value="déplacement">Déplacement</option>
          <option value="location">Location</option>
        </select>
        </div>
      </div>

      <div class="modern-field field-wide">
        <label>Libellé</label>
        <div class="clients-input-shell">
          ${clientPageIcon('postal')}
        <input id="prest_label" name="label" required />
        </div>
      </div>

      <div class="modern-field">
        <label>Qté</label>
        <div class="clients-input-shell">
          ${clientPageIcon('add')}
        <input name="qty" type="number" step="0.01" value="1" required />
        </div>
      </div>

      <div class="modern-field">
        <label>Unité</label>
        <div class="clients-input-shell">
          ${clientPageIcon('database')}
        <select name="unit" required>
          <option value="h">h</option>
          <option value="forfait">forfait</option>
          <option value="u">u</option>
          <option value="kilos">kilos</option>
        </select>
        </div>
      </div>

      <div class="modern-field">
        <label>Coût unitaire (€)</label>
        <div class="clients-input-shell">
          ${clientPageIcon('postal')}
        <input id="prest_cost" name="cost_unit" type="number" min="0" step="0.01" value="" placeholder="Coût interne" />
        </div>
      </div>

      <div class="modern-field">
        <label>Marge (%)</label>
        <div class="clients-input-shell">
          ${clientPageIcon('add')}
        <input id="prest_margin" name="margin_pct" type="number" step="0.1" value="" placeholder="0" />
        </div>
      </div>

      <div class="modern-field">
        <label>Prix unitaire (€)</label>
        <div class="clients-input-shell">
          ${clientPageIcon('postal')}
        <input id="prest_price" name="unit_price" type="number" step="0.01" required />
        </div>
      </div>

      <div class="quote-material-summary">
        <span>Total main-d'œuvre</span>
        <strong id="prest_total_preview">—</strong>
        <div>
          <small>Prix unitaire : <b id="prest_unit_preview">—</b></small>
        </div>
      </div>

      <div class="modern-form-actions field-wide">
        <button type="submit" class="clients-submit-btn"><span>${clientPageIcon('add', 'clients-submit-icon')}</span>Ajouter au devis</button>
      </div>
    </div>
  </form>
            </article>
          </div>
              </section>
            </div>
          </div>
        </section>
<script>
(function () {
  var costInput = document.getElementById('prest_cost');
  var marginInput = document.getElementById('prest_margin');
  var priceInput = document.getElementById('prest_price');
  var typeInput = document.getElementById('prest_type');
  var labelInput = document.getElementById('prest_label');
  var qtyInput = document.querySelector('#prestForm input[name="qty"]');
  var totalPreview = document.getElementById('prest_total_preview');
  var unitPreview = document.getElementById('prest_unit_preview');

  if (!costInput || !marginInput || !priceInput) return;

  function updatePrice() {
    var cost = Number(costInput.value || 0);
    var margin = Number(marginInput.value || 0);
    var price = cost * (1 + margin / 100);
    priceInput.value = price.toFixed(2);
    if (unitPreview) unitPreview.textContent = price.toFixed(2) + ' €';
    if (totalPreview) {
      var qty = Number(qtyInput?.value || 0);
      totalPreview.textContent = qty > 0 ? (qty * price).toFixed(2) + ' €' : '—';
    }
  }

  costInput.addEventListener('input', updatePrice);
  marginInput.addEventListener('input', updatePrice);
  priceInput.addEventListener('input', function(){
    var price = Number(priceInput.value || 0);
    if (unitPreview) unitPreview.textContent = price > 0 ? price.toFixed(2) + ' €' : '—';
    if (totalPreview) {
      var qty = Number(qtyInput?.value || 0);
      totalPreview.textContent = qty > 0 && price > 0 ? (qty * price).toFixed(2) + ' €' : '—';
    }
  });
  if (qtyInput) qtyInput.addEventListener('input', updatePrice);

  typeInput.addEventListener('change', function () {
    if (!labelInput.value.trim()) {
      labelInput.value = typeInput.value;
    }
  });

  updatePrice();
})();
</script>

  <script>
  (function(){
    const type = document.getElementById('prest_type');
    const label = document.getElementById('prest_label');
    if (!type || !label) return;

    function sync(){
      const t = type.value || '';
      if (!label.value.trim()) label.value = t;
    }
    type.addEventListener('change', sync);
    sync();
  })();
  </script>
<section class="quote-work-card quote-lines-section">
  <div class="modern-list-head">
    <h2>Lignes du devis</h2>
    <span>${lines.length} ligne${lines.length > 1 ? 's' : ''}</span>
  </div>

  <div class="quote-lines quote-work-lines">

${lines.length ? lines.map(l => `

<article class="quote-card quote-work-line-card">

  <div class="quote-card-head">

    <span class="quote-type">
      ${escHtml(l.category || '')}
    </span>

    <div class="quote-line-actions">
    <form method="POST"
          action="/devis/line/delete"
          onsubmit="return confirm('Supprimer ?')">

      <input type="hidden" name="quote_id" value="${id}">
      <input type="hidden" name="id" value="${l.id}">

      <button class="delete-btn" aria-label="Supprimer">${clientPageIcon('trash', 'modern-action-icon')}</button>

    </form>
<form
  method="GET"
  action="/devis/line/${l.id}/edit"
>

  <button
    type="submit"
    class="edit-btn"
    aria-label="Modifier">
    Modifier
  </button>

</form>
    </div>
  </div>

  <h3>${escHtml(l.label || '')}</h3>

  <div class="quote-line-grid">
    <div>
      <span>Quantité</span>
      <strong>${Number(l.qty || 0).toFixed(2)} ${escHtml(l.unit || '')}</strong>
    </div>
    <div>
      <span>PU HT</span>
      <strong>${Number(l.unit_price || 0).toFixed(2)} €</strong>
    </div>
    <div>
      <span>Total HT</span>
      <strong>${Number(l.total || 0).toFixed(2)} €</strong>
    </div>
  </div>

</article>

`).join('') : '<div class="empty-state">Aucune ligne dans ce devis.</div>'}

  </div>
</section>

<section class="quote-collapsible-stack" aria-label="Sections secondaires du devis">
  <section class="quote-collapsible-section" id="quote-section-measurements" data-quote-collapsible>
    <button type="button" class="quote-collapsible-toggle" aria-expanded="false" aria-controls="quote-section-measurements-panel" data-quote-collapsible-toggle>
      <span class="quote-collapsible-title">
        ${clientPageIcon('measurements', 'quote-collapsible-icon')}
        <span>
          <strong>Prises de cotes</strong>
          <small>${linkedMeasurements.length} liée${linkedMeasurements.length > 1 ? 's' : ''}</small>
        </span>
      </span>
      <span class="quote-collapsible-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6"/></svg></span>
    </button>
    <div class="quote-collapsible-panel" id="quote-section-measurements-panel" hidden data-quote-collapsible-panel>
      <div class="quote-collapsible-content">
        <section class="quote-work-card measurement-linked-section quote-collapsible-inner-card">
          ${renderQuoteMeasurementCreationLinks(id)}
          ${renderMeasurementCards(linkedMeasurements, { fromQuoteId: id })}
        </section>
      </div>
    </div>
  </section>

  <section class="quote-collapsible-section" id="quote-section-notes" data-quote-collapsible>
    <button type="button" class="quote-collapsible-toggle" aria-expanded="false" aria-controls="quote-section-notes-panel" data-quote-collapsible-toggle>
      <span class="quote-collapsible-title">
        ${clientPageIcon('postal', 'quote-collapsible-icon')}
        <span>
          <strong>Notes chantier</strong>
          <small>${quote.notes ? 'Notes renseignées' : 'Aucune note'}</small>
        </span>
      </span>
      <span class="quote-collapsible-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6"/></svg></span>
    </button>
    <div class="quote-collapsible-panel" id="quote-section-notes-panel" hidden data-quote-collapsible-panel>
      <div class="quote-collapsible-content">
        <article class="quote-work-card quote-collapsible-inner-card">

    <form method="POST" action="/devis/${id}/notes" class="quote-notes-form">
      <textarea name="notes" rows="8">${escHtml(quote.notes || '')}</textarea>
      <div class="modern-form-actions">
        <button type="submit" class="clients-submit-btn"><span>${clientPageIcon('add', 'clients-submit-icon')}</span>Enregistrer</button>
      </div>
    </form>
        </article>
      </div>
    </div>
  </section>

  <section class="quote-collapsible-section" id="quote-section-photos" data-quote-collapsible>
    <button type="button" class="quote-collapsible-toggle" aria-expanded="false" aria-controls="quote-section-photos-panel" data-quote-collapsible-toggle>
      <span class="quote-collapsible-title">
        ${clientPageIcon('folder', 'quote-collapsible-icon')}
        <span>
          <strong>Photos et fichiers</strong>
          <small>Photos · ${photos.length}</small>
        </span>
      </span>
      <span class="quote-collapsible-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6"/></svg></span>
    </button>
    <div class="quote-collapsible-panel" id="quote-section-photos-panel" hidden data-quote-collapsible-panel>
      <div class="quote-collapsible-content">
        <article class="quote-work-card quote-collapsible-inner-card">

    <form method="POST" action="/devis/${id}/photo" enctype="multipart/form-data" class="quote-photo-form">
      <input type="file" name="photo" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" required>
      <button type="submit" class="modern-secondary-btn">Ajouter</button>
    </form>

    <div class="photo-grid quote-photo-grid">
      ${photosHtml || '<div class="empty-state">Aucune photo.</div>'}
    </div>
        </article>
      </div>
    </div>
  </section>

  <section class="quote-collapsible-section" id="quote-section-sketch" data-quote-collapsible>
    <button type="button" class="quote-collapsible-toggle" aria-expanded="false" aria-controls="quote-section-sketch-panel" data-quote-collapsible-toggle>
      <span class="quote-collapsible-title">
        ${clientPageIcon('measurements', 'quote-collapsible-icon')}
        <span>
          <strong>Croquis / notes manuscrites</strong>
          <small>Dessin au doigt, stylet ou souris</small>
        </span>
      </span>
      <span class="quote-collapsible-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6"/></svg></span>
    </button>
    <div class="quote-collapsible-panel" id="quote-section-sketch-panel" hidden data-quote-collapsible-panel>
      <div class="quote-collapsible-content">
        ${renderSketchBlock({ scope: 'quotes', id, className: 'quote-work-card quote-collapsible-inner-card' })}
      </div>
    </div>
  </section>
</section>

<div class="quote-lightbox" data-quote-lightbox hidden>
  <div class="quote-lightbox-backdrop" data-quote-lightbox-close></div>
  <div class="quote-lightbox-panel" role="dialog" aria-modal="true" aria-label="Visionneuse photo devis">
    <button type="button" class="quote-lightbox-close" data-quote-lightbox-close aria-label="Fermer la photo">×</button>
    <img src="" alt="" class="quote-lightbox-image" data-quote-lightbox-image>
    <p class="quote-lightbox-title" data-quote-lightbox-title></p>
  </div>
</div>

<script>
(function () {
  const sections = Array.from(document.querySelectorAll('[data-quote-collapsible]'));
  if (!sections.length) return;

  function setSection(section, open) {
    const toggle = section.querySelector('[data-quote-collapsible-toggle]');
    const panel = section.querySelector('[data-quote-collapsible-panel]');
    if (!toggle || !panel) return;
    section.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      panel.hidden = false;
      window.requestAnimationFrame(function () {
        panel.style.maxHeight = panel.scrollHeight + 'px';
      });
    } else {
      panel.style.maxHeight = panel.scrollHeight + 'px';
      window.requestAnimationFrame(function () {
        panel.style.maxHeight = '0px';
      });
      window.setTimeout(function () {
        if (toggle.getAttribute('aria-expanded') !== 'true') panel.hidden = true;
      }, 220);
    }
  }

  sections.forEach(function (section) {
    const toggle = section.querySelector('[data-quote-collapsible-toggle]');
    const panel = section.querySelector('[data-quote-collapsible-panel]');
    if (!toggle || !panel) return;
    panel.style.maxHeight = '0px';
    toggle.addEventListener('click', function () {
      const shouldOpen = toggle.getAttribute('aria-expanded') !== 'true';
      if (shouldOpen && window.matchMedia('(max-width: 768px)').matches) {
        sections.forEach(function (other) {
          if (other !== section) setSection(other, false);
        });
      }
      setSection(section, shouldOpen);
    });
  });

  const targetedSection = window.location.hash ? document.querySelector(window.location.hash) : null;
  if (targetedSection && targetedSection.matches('[data-quote-collapsible]')) {
    setSection(targetedSection, true);
    window.requestAnimationFrame(function () { targetedSection.scrollIntoView({ block: 'start' }); });
  }

  window.addEventListener('resize', function () {
    sections.forEach(function (section) {
      const toggle = section.querySelector('[data-quote-collapsible-toggle]');
      const panel = section.querySelector('[data-quote-collapsible-panel]');
      if (toggle && panel && toggle.getAttribute('aria-expanded') === 'true') {
        panel.style.maxHeight = panel.scrollHeight + 'px';
      }
    });
  });
})();
</script>

<script>
(function () {
  const lightbox = document.querySelector('[data-quote-lightbox]');
  if (!lightbox) return;

  const image = lightbox.querySelector('[data-quote-lightbox-image]');
  const title = lightbox.querySelector('[data-quote-lightbox-title]');
  const closeControls = lightbox.querySelectorAll('[data-quote-lightbox-close]');

  function closeLightbox() {
    lightbox.hidden = true;
    document.body.classList.remove('quote-lightbox-open');
    if (image) {
      image.removeAttribute('src');
      image.alt = '';
    }
    if (title) title.textContent = '';
  }

  function openLightbox(url, label) {
    if (!image || !url) return;
    image.src = url;
    image.alt = label || 'Photo du devis';
    if (title) title.textContent = label || '';
    lightbox.hidden = false;
    document.body.classList.add('quote-lightbox-open');
  }

  document.querySelectorAll('[data-quote-photo-url]').forEach(function (button) {
    button.addEventListener('click', function () {
      openLightbox(button.getAttribute('data-quote-photo-url'), button.getAttribute('data-quote-photo-title'));
    });
  });

  closeControls.forEach(function (control) {
    control.addEventListener('click', closeLightbox);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !lightbox.hidden) closeLightbox();
  });
})();
</script>
<script src="/sketchpad.js"></script>
<script>
window.initSketchPad && window.initSketchPad({
  root: document.querySelector('[data-sketchpad][data-sketch-scope="quotes"]'),
  getSaveUrl: function (root) {
    return '/api/devis/' + root.dataset.sketchId + '/sketch';
  },
  getImageUrl: function (root) {
    return root.dataset.sketchImageUrl;
  }
});
</script>

</div>

  `;
}

module.exports = { renderQuoteDetailView };

