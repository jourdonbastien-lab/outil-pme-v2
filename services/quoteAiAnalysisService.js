'use strict';

function createQuoteAiAnalysisService(dependencies = {}) {
  const {
    db, profitabilityService, quoteAiReview, projectProfitability, costFields, model,
    getApiKey, fetchImpl, AbortControllerImpl, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout,
    parseOptionalId, now = () => new Date().toISOString(), logError = console.error
  } = dependencies;
  if (!db || typeof db.prepare !== 'function' || typeof db.transaction !== 'function') throw new TypeError('Base analyse IA devis manquante.');
  if (!profitabilityService || typeof profitabilityService.getQuoteProfitability !== 'function') throw new TypeError('Service rentabilité devis manquant.');
  if (!quoteAiReview || typeof quoteAiReview.calculateAutomaticLineReview !== 'function') throw new TypeError('Moteur analyse IA devis manquant.');
  if (!projectProfitability || !Array.isArray(projectProfitability.WORK_CATEGORIES)) throw new TypeError('Catégories IA devis manquantes.');
  if (!Array.isArray(costFields) || typeof getApiKey !== 'function' || typeof parseOptionalId !== 'function') throw new TypeError('Dépendances IA devis manquantes.');

  function quoteExists(quoteId) {
    return Boolean(db.prepare('SELECT id FROM quotes WHERE id = ?').get(quoteId));
  }

  function quoteAiReviewPublic(row) {
    const parseJson = (value, fallback) => {
      try { return JSON.parse(String(value || '')); } catch { return fallback; }
    };
    const checks = parseJson(row.checks_json, {});
    const ai = parseJson(row.ai_response_json, {});
    return {
      id: row.id,
      quoteId: row.quote_id,
      riskLevel: row.risk_level,
      summary: {
        totalHT: row.total_ht,
        costPrice: row.cost_price,
        marginAmount: row.margin_amount,
        marginOnCost: row.margin_on_cost,
        marginOnSale: row.margin_on_sale,
        ...(checks.summary || {})
      },
      warnings: checks.warnings || [],
      positivePoints: checks.positivePoints || [],
      recommendation: checks.recommendation || '',
      ai: { used: Boolean(ai.used), message: String(ai.message || '') },
      modelName: row.model_name || null,
      createdAt: row.created_at
    };
  }

  async function requestOpenAiQuoteReview(quote, lines, deterministic) {
    const apiKey = String(getApiKey() || '').trim();
    const safePayload = {
      quoteNumber: quote.id,
      workDescription: String(quote.title || ''),
      lines: lines.map((line) => ({
        category: String(line.category || ''), label: String(line.label || ''),
        quantity: Number(line.qty || 0), unit: String(line.unit || ''),
        unitPriceHT: Number(line.unit_price || 0), totalHT: Number(line.total || 0)
      })),
      financialSummary: deterministic.summary,
      deterministicWarnings: deterministic.warnings
    };
    return quoteAiReview.requestOpenAiInterpretation({
      apiKey, model, safePayload, deterministicRisk: deterministic.riskLevel, fetchImpl,
      AbortControllerImpl, setTimeoutImpl, clearTimeoutImpl, timeoutMs: 30000
    });
  }

  async function reviewQuote(quoteId, userId) {
    const context = profitabilityService.getQuoteProfitability(quoteId);
    if (!context) return null;
    const { quote, lines, input, calculations: profitability } = context;
    const deterministic = quoteAiReview.calculateAutomaticLineReview(profitability, quote, lines);
    let aiResult = { used: false, message: 'Analyse automatique effectuée sans interprétation IA.' };
    try { aiResult = await requestOpenAiQuoteReview(input, lines, deterministic); }
    catch (error) {
      logError('Erreur analyse IA devis:', error?.message || error);
      aiResult = { used: false, message: 'Interprétation IA indisponible. Les contrôles automatiques restent valides.' };
    }
    const aiReview = aiResult.review || {};
    const review = {
      ...deterministic,
      riskLevel: aiReview.riskLevel || deterministic.riskLevel,
      warnings: Array.from(new Set(deterministic.warnings.concat(aiReview.warnings || []))),
      positivePoints: Array.from(new Set(deterministic.positivePoints.concat(aiReview.positivePoints || []))),
      recommendation: aiReview.recommendation || deterministic.recommendation
    };
    const createdAt = now();
    const createdBy = parseOptionalId(userId);
    db.prepare(`INSERT INTO quote_profitability_forecasts
      (quote_id, analysis_json, reliability_level, analyzed_at, engine_version, created_at, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(quote_id) DO UPDATE SET analysis_json=excluded.analysis_json, reliability_level=excluded.reliability_level,
        analyzed_at=excluded.analyzed_at, engine_version=excluded.engine_version, updated_at=excluded.updated_at, updated_by=excluded.updated_by`
    ).run(quoteId, JSON.stringify(profitability), profitability.reliability, createdAt, profitability.engineVersion, createdAt, createdAt, createdBy);
    const info = db.prepare(`INSERT INTO quote_ai_reviews
      (quote_id, risk_level, total_ht, cost_price, margin_amount, margin_on_cost, margin_on_sale, checks_json, ai_response_json, model_name, created_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      quoteId, review.riskLevel, review.summary.totalHT, review.summary.costPrice,
      review.summary.marginAmount, review.summary.marginOnCost, review.summary.marginOnSale, JSON.stringify(review),
      JSON.stringify({ used: aiResult.used, message: aiResult.message }), aiResult.used ? model : null, createdAt, createdBy
    );
    return { id: info.lastInsertRowid, ...review, ai: { used: aiResult.used, message: aiResult.message }, createdAt };
  }

  function listQuoteAiReviews(quoteId) {
    return db.prepare('SELECT * FROM quote_ai_reviews WHERE quote_id = ? ORDER BY created_at DESC, id DESC').all(quoteId).map(quoteAiReviewPublic);
  }

  function applyQuoteAiCosts(quoteId, body) {
    const category = String(body?.work_category || '').trim();
    if (category && !projectProfitability.WORK_CATEGORIES.includes(category)) throw new Error('Catégorie d’ouvrage invalide');
    const values = costFields.map((field) => {
      const raw = String(body?.[field] ?? '').trim();
      if (!raw) return null;
      const value = Number(raw.replace(',', '.'));
      if (!Number.isFinite(value) || value < 0) throw new Error(`Valeur invalide: ${field}`);
      return value;
    });
    db.transaction(() => {
      db.prepare(`UPDATE quotes SET ${costFields.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`).run(...values, quoteId);
      db.prepare('UPDATE quotes SET work_category = ? WHERE id = ?').run(category || null, quoteId);
    })();
  }

  return { quoteExists, quoteAiReviewPublic, requestOpenAiQuoteReview, reviewQuote, listQuoteAiReviews, applyQuoteAiCosts };
}

module.exports = { createQuoteAiAnalysisService };
