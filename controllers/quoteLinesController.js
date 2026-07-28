'use strict';

function optionalNumber(body, name) {
  const raw = String(body[name] ?? '').trim();
  return raw === '' ? null : Number(raw.replace(',', '.'));
}

function createQuoteLinesController(dependencies) {
  const { quoteLinesService, renderQuoteLineEditView, pageTemplate, escapeHtml, clientPageIcon, lineCostCategories } = dependencies;

  function showQuoteLineEditForm(req, res) {
    const line = quoteLinesService.getQuoteLineById(req.params.id);
    if (!line) return res.status(404).send('Ligne introuvable');
    const html = renderQuoteLineEditView({ line, escapeHtml, clientPageIcon, lineCostCategories });
    return res.send(pageTemplate(req, 'Modifier la ligne', html));
  }

  function updateQuoteLine(req, res) {
    const line = quoteLinesService.getQuoteLineById(req.params.id);
    if (!line) return res.status(404).send('Ligne introuvable');
    const qty = Number(req.body.qty || 0);
    const unitPrice = Number(req.body.unit_price || 0);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      return res.status(400).send('Quantité ou prix de vente invalide');
    }
    const costUnit = optionalNumber(req.body, 'cost_unit');
    const marginPct = optionalNumber(req.body, 'margin_pct');
    const coefficient = optionalNumber(req.body, 'coefficient');
    const costTotal = optionalNumber(req.body, 'cost_total');
    const hours = optionalNumber(req.body, 'hours');
    const hourlyCost = optionalNumber(req.body, 'hourly_cost');
    const costCategory = String(req.body.cost_category || '').trim();
    if (costUnit !== null && (!Number.isFinite(costUnit) || costUnit < 0)) return res.status(400).send('Coût unitaire invalide');
    for (const [label, value] of [['marge', marginPct], ['coefficient', coefficient], ['coût total', costTotal], ['heures', hours], ['coût horaire', hourlyCost]]) {
      if (value !== null && (!Number.isFinite(value) || (label !== 'marge' && value < 0))) return res.status(400).send(`${label} invalide`);
    }
    if (costCategory && !lineCostCategories.includes(costCategory)) return res.status(400).send('Catégorie de coût invalide');
    quoteLinesService.updateQuoteLine(req.params.id, {
      label: req.body.label, qty, unitPrice, costUnit, marginPct, coefficient, costTotal, hours, hourlyCost, costCategory
    });
    return res.redirect('/devis/' + line.quote_id);
  }

  function createQuoteLine(req, res) {
    const quoteId = Number(req.body.quote_id);
    const category = String(req.body.category || '').trim();
    const label = String(req.body.label || '').trim();
    const unit = String(req.body.unit || '').trim();
    const qty = Number(req.body.qty || 0);
    const unitPrice = Number(req.body.unit_price || 0);
    const costUnit = optionalNumber(req.body, 'cost_unit');
    const marginPct = optionalNumber(req.body, 'margin_pct');
    const coefficient = optionalNumber(req.body, 'coefficient');
    const costTotal = optionalNumber(req.body, 'cost_total');
    const hours = optionalNumber(req.body, 'hours');
    const hourlyCost = optionalNumber(req.body, 'hourly_cost');
    const costCategory = String(req.body.cost_category || '').trim();
    const hasCost = [costUnit, costTotal, marginPct, coefficient, hours, hourlyCost].some((value) => value !== null);
    const costSource = String(req.body.cost_source || (hasCost ? 'saisie de la ligne' : '')).trim();
    if (!quoteId || !label || !unit || !Number.isFinite(qty) || !Number.isFinite(unitPrice) || qty <= 0 || unitPrice <= 0) {
      return res.status(400).send('Données ligne invalides');
    }
    if ((costUnit !== null && (!Number.isFinite(costUnit) || costUnit < 0)) || (marginPct !== null && !Number.isFinite(marginPct))) {
      return res.status(400).send('Coût ou marge de ligne invalide');
    }
    for (const value of [coefficient, costTotal, hours, hourlyCost]) {
      if (value !== null && (!Number.isFinite(value) || value < 0)) return res.status(400).send('Donnée de coût invalide');
    }
    quoteLinesService.createQuoteLine({
      quoteId, category, label, unit, qty, unitPrice, costUnit, marginPct, coefficient,
      costTotal, hours, hourlyCost, costCategory, costSource
    });
    return res.redirect('/devis/' + quoteId);
  }

  function deleteQuoteLine(req, res) {
    const id = Number(req.body.id);
    const quoteId = Number(req.body.quote_id);
    if (!id || !quoteId) return res.status(400).send('Paramètres invalides');
    quoteLinesService.deleteQuoteLine(id, quoteId);
    return res.redirect('/devis/' + quoteId);
  }

  function createMaterialQuoteLine(req, res) {
    const quoteId = Number(req.body.quote_id);
    const materialId = Number(req.body.material_id);
    const category = String(req.body.category || 'Matière').trim();
    if (!quoteId || !materialId) return res.status(400).send('Paramètres invalides');
    try {
      quoteLinesService.createMaterialQuoteLine({
        quoteId, materialId, category, lenM: req.body.len_m,
        thMm: req.body.th_mm, wMm: req.body.w_mm, lMm: req.body.l_mm
      });
    } catch (error) {
      if (error.statusCode) return res.status(error.statusCode).send(error.message);
      throw error;
    }
    return res.redirect('/devis/' + quoteId);
  }
  return { showQuoteLineEditForm, updateQuoteLine, createQuoteLine, deleteQuoteLine, createMaterialQuoteLine };
}

module.exports = { createQuoteLinesController };
