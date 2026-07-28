'use strict';

function renderQuoteLineEditView({ line, escapeHtml, clientPageIcon, lineCostCategories }) {
  return `
    <main class="quote-line-editor-page">
      <header class="quote-line-editor-hero">
        <a href="/devis/${line.quote_id}" class="quote-line-editor-back" aria-label="Retour au devis">${clientPageIcon('arrow-left')}<span>Retour</span></a>
        <span class="quote-line-editor-hero-icon">${clientPageIcon('quotes')}</span>
        <div><p>Devis #${line.quote_id}</p><h1>Modifier la ligne</h1><span>${escapeHtml(line.label || 'Sans libellé')}</span></div>
      </header>
      <form method="POST" action="/devis/line/${line.id}/edit" id="quoteLineEditForm" class="quote-line-editor-card">
        <section class="quote-line-editor-section">
          <div class="quote-line-editor-section-head"><h2>Informations générales</h2><p>Identification et classement de la ligne.</p></div>
          <div class="quote-line-editor-grid">
            <label class="quote-line-editor-field field-wide"><span>Libellé</span><input name="label" value="${escapeHtml(line.label || '')}" required autocomplete="off"></label>
            <label class="quote-line-editor-field field-wide"><span>Catégorie de coût</span><select name="cost_category"><option value="">Détection automatique</option>${lineCostCategories.map((category) => `<option value="${escapeHtml(category)}" ${line.cost_category === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}</select><small>Laissez vide pour utiliser la détection automatique.</small></label>
          </div>
        </section>
        <section class="quote-line-editor-section">
          <div class="quote-line-editor-section-head"><h2>Quantité</h2></div>
          <div class="quote-line-editor-grid">
            <label class="quote-line-editor-field"><span>Quantité</span><input name="qty" type="number" inputmode="decimal" min="0.01" step="0.01" value="${escapeHtml(String(line.qty))}" required></label>
            <label class="quote-line-editor-field"><span>Unité</span><input name="unit" value="${escapeHtml(line.unit || '')}" readonly><small>L’unité existante est conservée.</small></label>
          </div>
        </section>
        <section class="quote-line-editor-section">
          <div class="quote-line-editor-section-head"><h2>Coût d’achat</h2><p>Données internes utilisées par la rentabilité.</p></div>
          <div class="quote-line-editor-grid">
            <label class="quote-line-editor-field"><span>Prix d’achat unitaire</span><span class="quote-line-editor-input-unit"><input name="cost_unit" type="number" inputmode="decimal" min="0" step="0.01" value="${line.cost_unit == null ? '' : escapeHtml(String(line.cost_unit))}"><b>€</b></span><small>Coût réel payé par unité.</small></label>
            <label class="quote-line-editor-field"><span>Coût total explicite</span><span class="quote-line-editor-input-unit"><input name="cost_total" type="number" inputmode="decimal" min="0" step="0.01" value="${line.cost_total == null ? '' : escapeHtml(String(line.cost_total))}"><b>€</b></span><small>Prioritaire lorsqu’il est renseigné.</small></label>
          </div>
        </section>
        <section class="quote-line-editor-section">
          <div class="quote-line-editor-section-head"><h2>Règle de vente</h2><p>Le prix de vente reste calculé avec la formule actuelle du devis.</p></div>
          <div class="quote-line-editor-grid">
            <label class="quote-line-editor-field"><span>Marge</span><span class="quote-line-editor-input-unit"><input name="margin_pct" type="number" inputmode="decimal" step="0.1" value="${line.margin_pct == null ? '' : escapeHtml(String(line.margin_pct))}"><b>%</b></span><small>Pourcentage appliqué au prix d’achat.</small></label>
            <label class="quote-line-editor-field"><span>Coefficient</span><input name="coefficient" type="number" inputmode="decimal" min="0.01" step="0.01" value="${line.coefficient == null ? '' : escapeHtml(String(line.coefficient))}"><small>Multiplicateur enregistré pour la vente.</small></label>
            <label class="quote-line-editor-field field-wide"><span>Prix de vente unitaire</span><span class="quote-line-editor-input-unit"><input name="unit_price" type="number" inputmode="decimal" min="0" step="0.01" value="${escapeHtml(String(line.unit_price))}" required><b>€</b></span></label>
          </div>
        </section>
        <section class="quote-line-editor-section quote-line-editor-labor">
          <div class="quote-line-editor-section-head"><h2>Main-d’œuvre</h2><p>À renseigner uniquement pour une ligne de temps de travail.</p></div>
          <div class="quote-line-editor-grid">
            <label class="quote-line-editor-field"><span>Heures</span><span class="quote-line-editor-input-unit"><input name="hours" type="number" inputmode="decimal" min="0" step="0.01" value="${line.hours == null ? '' : escapeHtml(String(line.hours))}"><b>h</b></span></label>
            <label class="quote-line-editor-field"><span>Coût horaire interne</span><span class="quote-line-editor-input-unit"><input name="hourly_cost" type="number" inputmode="decimal" min="0" step="0.01" value="${line.hourly_cost == null ? '' : escapeHtml(String(line.hourly_cost))}"><b>€/h</b></span><small>Utilisé pour calculer le coût de la main-d’œuvre.</small></label>
          </div>
        </section>
        <aside class="quote-line-editor-summary" aria-live="polite"><h2>Synthèse</h2><dl><div><dt>Coût d’achat total</dt><dd data-line-summary-cost>Non calculable</dd></div><div><dt>Prix de vente HT</dt><dd data-line-summary-sale>Non calculable</dd></div><div><dt>Marge estimée</dt><dd data-line-summary-margin>Non calculable</dd></div><div><dt>Marge sur vente</dt><dd data-line-summary-rate>Non calculable</dd></div></dl></aside>
        <div class="quote-line-editor-actions"><a href="/devis/${line.quote_id}" class="modern-secondary-btn">Annuler</a><button type="submit" class="clients-submit-btn" data-line-save>Enregistrer</button></div>
      </form>
    </main>
    <script>(function(){var form=document.getElementById('quoteLineEditForm');if(!form)return;var cost=form.elements.cost_unit;var totalCost=form.elements.cost_total;var margin=form.elements.margin_pct;var price=form.elements.unit_price;var qty=form.elements.qty;var hours=form.elements.hours;var hourly=form.elements.hourly_cost;var save=form.querySelector('[data-line-save]');var euro=new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'});function number(input){if(!input||input.value==='')return null;var value=Number(input.value);return Number.isFinite(value)?value:null;}function updatePrice(){if(cost.value==='')return;var c=Number(cost.value);var m=margin.value===''?0:Number(margin.value);if(Number.isFinite(c)&&Number.isFinite(m))price.value=(c*(1+m/100)).toFixed(2);}function updateSummary(){var q=number(qty);var unitCost=number(cost);var explicitCost=number(totalCost);var h=number(hours);var rate=number(hourly);var unitSale=number(price);var purchase=explicitCost!==null?explicitCost:(unitCost!==null&&q!==null?unitCost*q:(h!==null&&rate!==null?h*rate:null));var sale=unitSale!==null&&q!==null?unitSale*q:null;var estimatedMargin=purchase!==null&&sale!==null?sale-purchase:null;var marginRate=estimatedMargin!==null&&sale>0?estimatedMargin/sale*100:null;form.querySelector('[data-line-summary-cost]').textContent=purchase===null?'Non calculable':euro.format(purchase);form.querySelector('[data-line-summary-sale]').textContent=sale===null?'Non calculable':euro.format(sale);form.querySelector('[data-line-summary-margin]').textContent=estimatedMargin===null?'Non calculable':euro.format(estimatedMargin);form.querySelector('[data-line-summary-rate]').textContent=marginRate===null?'Non calculable':marginRate.toFixed(2)+' %';}cost.addEventListener('input',function(){updatePrice();updateSummary();});margin.addEventListener('input',function(){updatePrice();updateSummary();});[totalCost,price,qty,hours,hourly].forEach(function(input){input.addEventListener('input',updateSummary);});form.addEventListener('submit',function(){save.disabled=true;save.setAttribute('aria-busy','true');save.textContent='Enregistrement…';});updateSummary();})();</script>
  `;
}

module.exports = { renderQuoteLineEditView };
