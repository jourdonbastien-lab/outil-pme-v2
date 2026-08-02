'use strict';

function createQuoteProfitabilityService(dependencies = {}) {
  const { db, projectProfitability, parseOptionalId, round2, randomUUID, now = () => new Date().toISOString() } = dependencies;
  if (!db || typeof db.prepare !== 'function') throw new TypeError('Base rentabilité devis manquante.');
  if (!projectProfitability || typeof projectProfitability.analyzeQuoteLines !== 'function') throw new TypeError('Moteur rentabilité devis manquant.');
  if (typeof parseOptionalId !== 'function' || typeof round2 !== 'function' || typeof randomUUID !== 'function') {
    throw new TypeError('Helpers rentabilité devis manquants.');
  }

  function parseJsonArray(value) {
    try { const parsed = JSON.parse(String(value || '[]')); return Array.isArray(parsed) ? parsed : []; }
    catch { return []; }
  }

  function quoteExists(quoteId) {
    return Boolean(db.prepare('SELECT id FROM quotes WHERE id = ?').get(quoteId));
  }

  function getQuoteProfitability(quoteId) {
    const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId);
    if (!quote) return null;
    const lines = db.prepare('SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY position ASC, id ASC').all(quoteId);
    const saved = db.prepare('SELECT * FROM quote_profitability_forecasts WHERE quote_id = ?').get(quoteId) || null;
    const adjustments = parseJsonArray(saved?.manual_adjustments_json);
    const calculations = projectProfitability.analyzeQuoteLines({ quote, lines, adjustments });
    return {
      quote, lines, saved, input: quote, calculations,
      historicalCost: Number(quote.cout_revient) > 0 ? Number(quote.cout_revient) : null,
      historicalForecastCosts: saved ? {
        materialCost: saved.material_cost, subcontractingCost: saved.subcontracting_cost,
        laborCost: saved.labor_cost, totalCost: saved.total_cost_price
      } : null,
      detectedCategories: projectProfitability.detectWorkCategories(quote, lines)
    };
  }

  function profitabilityPublic(context) {
    return {
      quoteId: context.quote.id,
      saved: context.saved,
      calculations: context.calculations,
      historicalCost: context.historicalCost,
      detectedCategories: context.detectedCategories,
      availableCategories: projectProfitability.WORK_CATEGORIES,
      lineCostCategories: projectProfitability.LINE_COST_CATEGORIES
    };
  }

  function saveQuoteCostForecast(quoteId, body, userId) {
    const requested = Array.isArray(body?.adjustments) ? body.adjustments : [];
    const adjustments = requested.slice(0, 50).map((item, index) => {
      const amount = Number(String(item?.amount ?? '').replace(',', '.'));
      if (!Number.isFinite(amount) || amount <= 0) throw new Error(`Montant invalide pour l’ajustement ${index + 1}`);
      return {
        id: String(item.id || randomUUID()),
        label: String(item.label || '').trim() || 'Ajustement manuel',
        type: projectProfitability.LINE_COST_CATEGORIES.includes(item.type) ? item.type : 'divers',
        amount: round2(amount),
        lineId: parseOptionalId(item.lineId)
      };
    });
    const lines = db.prepare('SELECT * FROM quote_lines WHERE quote_id = ?').all(quoteId);
    for (const adjustment of adjustments) {
      if (adjustment.lineId && lines.some((line) => line.id === adjustment.lineId && (line.cost_total != null || line.cost_unit != null))) {
        throw new Error('Un ajustement ne peut pas doubler le coût déjà enregistré d’une ligne.');
      }
    }
    const timestamp = now();
    db.prepare(`
      INSERT INTO quote_profitability_forecasts (quote_id, manual_adjustments_json, notes, created_at, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(quote_id) DO UPDATE SET manual_adjustments_json=excluded.manual_adjustments_json,
        notes=excluded.notes, updated_at=excluded.updated_at, updated_by=excluded.updated_by
    `).run(quoteId, JSON.stringify(adjustments), String(body?.notes || '').trim(), timestamp, timestamp, parseOptionalId(userId));
    return profitabilityPublic(getQuoteProfitability(quoteId));
  }

  return { quoteExists, getQuoteProfitability, profitabilityPublic, saveQuoteCostForecast };
}

module.exports = { createQuoteProfitabilityService };
