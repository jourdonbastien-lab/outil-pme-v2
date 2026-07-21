'use strict';

function renderClientOrderProfitabilityView(data) {
  const {
    order, forecastData, realData, financialSnapshot,
    escapeHtml, formatEuroFr, clientPageIcon, pcFolderIcon,
    calculateCostLine, laborCategories, materialUnits,
    clientOrderFolderUrl, roundAmount
  } = data;

  function renderCostLineFields(lineType, line = {}) {
    const value = (name) => escapeHtml(line[name] == null ? '' : String(line[name]));
    const common = `
      <label><span>Désignation</span><input name="designation" maxlength="255" value="${value('designation')}" required></label>
      ${lineType === 'other' ? '' : `<label><span>Catégorie</span>${lineType === 'labor'
        ? `<select name="category">${laborCategories.map((category) => `<option value="${escapeHtml(category)}" ${line.category === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}</select>`
        : `<input name="category" maxlength="100" value="${value('category')}" placeholder="Matière, galvanisation…">`}</label>`}`;
    const financial = lineType === 'labor'
      ? `<label><span>Heures prévues</span><input name="planned_hours" inputmode="decimal" value="${escapeHtml(line.planned_minutes == null ? '' : String(Number(line.planned_minutes) / 60))}" required></label>
         <label><span>Coût horaire HT</span><input name="hourly_cost_ht" inputmode="decimal" value="${value('hourly_cost_ht')}" required></label>
         <details class="order-cost-advanced order-cost-wide"><summary>Options avancées</summary><label><span>Vente horaire HT</span><input name="hourly_sale_ht" inputmode="decimal" value="${value('hourly_sale_ht')}"></label></details>`
      : lineType === 'other'
        ? `<input type="hidden" name="quantity" value="1"><input type="hidden" name="unit" value="forfait"><input type="hidden" name="unit_sale_ht" value="${value('unit_sale_ht') || '0'}"><label><span>Montant prévu HT</span><input name="unit_cost_ht" inputmode="decimal" value="${value('unit_cost_ht')}" required></label>`
        : `<label><span>Quantité</span><input name="quantity" inputmode="decimal" value="${value('quantity') || '1'}" required></label>
         <label><span>Unité</span><select name="unit">${materialUnits.map((unit) => `<option value="${escapeHtml(unit)}" ${line.unit === unit ? 'selected' : ''}>${escapeHtml(unit)}</option>`).join('')}</select></label>
         <label><span>Prix d’achat unitaire HT</span><input name="unit_cost_ht" inputmode="decimal" value="${value('unit_cost_ht')}" required></label>
         <label><span>Fournisseur</span><input name="supplier" maxlength="255" value="${value('supplier')}"></label>
         <details class="order-cost-advanced order-cost-wide"><summary>Options avancées</summary><label><span>Prix de vente unitaire HT</span><input name="unit_sale_ht" inputmode="decimal" value="${value('unit_sale_ht')}"></label></details>`;
    return `${common}${financial}<label class="order-cost-wide"><span>Notes</span><textarea name="notes" maxlength="2000">${escapeHtml(line.notes || '')}</textarea></label>`;
  }

  function renderOrderCostLine(line) {
    const calculated = calculateCostLine(line);
    const origin = line.source_type === 'quote' ? 'Issu du devis' : 'Ajout manuel';
    const detail = line.line_type === 'labor'
      ? `${calculated.hours.toFixed(2)} h`
      : line.line_type === 'other' ? '' : `${Number(line.quantity || 0).toFixed(2)} ${escapeHtml(line.unit || '')}`;
    const costIncomplete = line.source_type === 'quote' && calculated.cost <= 0;
    return `<article class="order-cost-line-card">
      <header><div><h4>${escapeHtml(line.designation)}</h4><p>${detail}${detail ? ' · ' : ''}Origine : ${origin}${costIncomplete ? ' · Coût à compléter' : ''}</p></div><strong class="${costIncomplete ? 'profit-missing' : ''}">${formatEuroFr(calculated.cost)}</strong></header>
      <div class="order-cost-actions"><details><summary class="modern-secondary-btn">Modifier</summary><form method="POST" action="/orders/client/${order.id}/cost-lines/${line.id}/edit" class="order-cost-form"><input type="hidden" name="line_type" value="${line.line_type}">${renderCostLineFields(line.line_type, line)}<button class="clients-submit-btn" type="submit">Enregistrer</button></form></details>
      <form method="POST" action="/orders/client/${order.id}/cost-lines/${line.id}/duplicate"><button class="modern-secondary-btn" type="submit">Dupliquer</button></form>
      <form method="POST" action="/orders/client/${order.id}/cost-lines/${line.id}/delete" onsubmit="return confirm('Supprimer définitivement cette ligne prévisionnelle ?');"><button class="modern-danger-btn" type="submit">Supprimer</button></form></div>
    </article>`;
  }

  function renderForecastCard() {
    const budget = financialSnapshot.budget;
    const metric = (label, value) => `<div><span>${label}</span><strong>${value}</strong></div>`;
    const laborLines = forecastData.lines.filter((line) => line.line_type === 'labor');
    const materialLines = forecastData.lines.filter((line) => line.line_type === 'material');
    const otherLines = forecastData.lines.filter((line) => line.line_type === 'other');
    const empty = '<p class="profitability-empty">Aucune matière ni main-d’œuvre renseignée</p>';
    const lineList = (lines) => lines.length ? `<div class="order-cost-lines">${lines.map(renderOrderCostLine).join('')}</div>` : empty;
    const group = (title, lines, total, extra, addLabel, lineType, primary = false) => `<details class="order-cost-group">
      <summary><span><strong>${title}</strong><small>${extra ? `${extra} · ` : ''}${formatEuroFr(total)}</small></span><span class="order-cost-chevron" aria-hidden="true">⌄</span></summary>
      ${lineList(lines)}<details class="order-cost-add"><summary class="${primary ? 'clients-submit-btn' : 'modern-secondary-btn'}">+ ${addLabel}</summary><form method="POST" action="/orders/client/${order.id}/cost-lines" class="order-cost-form"><input type="hidden" name="line_type" value="${lineType}">${renderCostLineFields(lineType)}<button class="clients-submit-btn" type="submit">Ajouter</button></form></details>
    </details>`;
    const importStatus = String(forecastData.importStatus || '');
    const importedCount = importStatus.startsWith('imported-') ? Math.max(0, Number.parseInt(importStatus.slice(9), 10) || 0) : 0;
    const importMessage = importedCount > 0 ? `${importedCount} ligne${importedCount > 1 ? 's' : ''} importée${importedCount > 1 ? 's' : ''}.` : importStatus === 'none' ? 'Aucune nouvelle ligne à importer.' : importStatus === 'no-quote' ? 'Aucun devis lié à cette commande.' : '';
    return `<section id="order-budget" class="pc-modern-panel order-forecast-card">
      <div class="modern-section-title"><span class="quote-ai-review-icon">${clientPageIcon('quotes')}</span><div><h2>Budget de la commande</h2><p>Le devis d’origine reste inchangé. Les lignes de ce budget sont indépendantes.</p></div></div>
      ${importMessage ? `<p class="order-budget-flash">${importMessage}</p>` : ''}
      <div class="order-forecast-summary">
        ${metric('Main-d’œuvre prévue', formatEuroFr(budget.labor))}
        ${metric('Matière prévue', formatEuroFr(budget.material))}
        ${metric('Autres coûts prévus', formatEuroFr(roundAmount(budget.subcontracting + budget.other)))}
        ${metric('Coût total prévu', formatEuroFr(budget.total))}
        ${metric('Heures prévues', `${financialSnapshot.hours.budgeted.toFixed(2)} h`)}
      </div>
      ${order.quote_id ? `<form method="POST" action="/orders/client/${order.id}/cost-lines/import-quote" class="order-import-quote" onsubmit="return confirm('Importer les lignes du devis #${order.quote_id} sans modifier le devis ?');"><button class="modern-secondary-btn" type="submit">Importer les lignes du devis</button><small>${forecastData.quoteLines.length} ligne(s) disponible(s), doublons ignorés.</small></form>` : ''}
      <div class="order-cost-groups">
        ${group('Main-d’œuvre', laborLines, budget.labor, `${financialSnapshot.hours.budgeted.toFixed(2)} h`, 'Ajouter de la main-d’œuvre', 'labor', true)}
        ${group('Matière', materialLines, budget.material, '', 'Ajouter de la matière', 'material', true)}
        ${group('Autres coûts', otherLines, roundAmount(budget.subcontracting + budget.other), '', 'Ajouter un autre coût', 'other')}
      </div>
    </section>`;
  }

  function renderOverview() {
    const contractPrice = financialSnapshot.revenue.expectedExVat;
    const forecastMargin = financialSnapshot.margin.forecastAmount;
    const marginRate = contractPrice > 0 ? financialSnapshot.margin.forecastRate : null;
    const state = contractPrice <= 0 || financialSnapshot.sources.budget === 'none'
      ? { label: 'Budget incomplet', className: 'is-incomplete' }
      : forecastMargin < 0 ? { label: 'En perte', className: 'is-loss' }
        : marginRate < 10 ? { label: 'À surveiller', className: 'is-warning' }
          : { label: 'Rentable', className: 'is-profitable' };
    const item = (label, value, className = '') => `<div><span>${label}</span><strong class="${className}">${value}</strong></div>`;
    return `<section class="profitability-global-section"><div class="profitability-global-heading"><div><span>Résultat de la commande</span><h2>${state.label}</h2></div><strong class="profitability-state ${state.className}">${state.label}</strong></div><div class="profitability-global-card">
      ${item('Prix de vente HT', formatEuroFr(contractPrice))}
      ${item('Coût total budgété', formatEuroFr(financialSnapshot.budget.total))}
      ${item('Marge estimée', formatEuroFr(forecastMargin), forecastMargin < 0 ? 'profit-negative' : 'profit-positive')}
      ${item('Marge estimée', marginRate === null ? 'Non calculable' : `${marginRate.toFixed(1)} %`, marginRate === null ? 'profit-missing' : forecastMargin < 0 ? 'profit-negative' : 'profit-positive')}
      ${item('Heures budgétées', `${financialSnapshot.hours.budgeted.toFixed(2)} h`)}
    </div></section>`;
  }

  function renderHoursTracking() {
    const planned = financialSnapshot.hours.budgeted;
    const hasActualHours = realData.hours.length > 0;
    const actual = hasActualHours ? financialSnapshot.hours.actual : null;
    const variance = actual === null ? null : roundAmount(actual - planned);
    const folderUrl = clientOrderFolderUrl(order);
    return `<section class="pc-modern-panel order-hours-tracking">
      <div class="modern-section-title"><span class="quote-ai-review-icon">${pcFolderIcon('Heure chantier', 'clients-ui-icon')}</span><div><h2>Suivi des heures</h2><p>Les heures réalisées proviennent uniquement des pointages liés à la commande.</p></div></div>
      <div class="order-hours-summary"><div><span>Heures prévues</span><strong>${planned.toFixed(2)} h</strong></div><div><span>Heures réalisées</span><strong class="${actual === null ? 'profit-missing' : ''}">${actual === null ? 'Aucune heure pointée' : `${actual.toFixed(2)} h`}</strong></div><div><span>Écart</span><strong class="${variance === null ? 'profit-missing' : variance > 0 ? 'profit-negative' : 'profit-positive'}">${variance === null ? 'Non calculable' : `${variance > 0 ? '+' : ''}${variance.toFixed(2)} h`}</strong></div></div>
      <a class="modern-secondary-btn order-hours-link" href="${folderUrl}/Heure%20chantier">Voir les heures</a>
    </section>`;
  }

  return `<div class="pc-modern-page order-profitability-page">
    <section class="pc-modern-hero order-profitability-hero">
      <div><span>Commande #${order.id}</span><h1>Budget de la commande</h1><p>${escapeHtml(order.name || 'Client')} · ${escapeHtml(order.description || `Commande_${order.id}`)}</p></div>
      <div class="pc-modern-actions"><span class="order-profitability-status">${escapeHtml(order.chantier_status || order.status || 'En cours')}</span><strong>${formatEuroFr(order.price)} HT</strong><a class="modern-cancel-link" href="${clientOrderFolderUrl(order)}">← Retour à la commande</a></div>
    </section>
    ${renderOverview()}
    ${renderForecastCard()}
    ${renderHoursTracking()}
  </div>`;
}

module.exports = { renderClientOrderProfitabilityView };
