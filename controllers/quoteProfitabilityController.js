'use strict';

function createQuoteProfitabilityController({ profitabilityService, parseOptionalId } = {}) {
  if (!profitabilityService) throw new TypeError('Service rentabilité devis manquant.');
  if (typeof parseOptionalId !== 'function') throw new TypeError('Validation identifiant devis manquante.');

  function getQuoteProfitability(req, res) {
    const quoteId = parseOptionalId(req.params.id);
    if (!quoteId) return res.status(400).json({ success: false, error: 'ID devis invalide' });
    const context = profitabilityService.getQuoteProfitability(quoteId);
    if (!context) return res.status(404).json({ success: false, error: 'Devis introuvable' });
    return res.json({ success: true, profitability: profitabilityService.profitabilityPublic(context) });
  }

  function saveQuoteCostForecast(req, res) {
    const quoteId = parseOptionalId(req.params.id);
    if (!quoteId) return res.status(400).json({ success: false, error: 'ID devis invalide' });
    if (!profitabilityService.quoteExists(quoteId)) return res.status(404).json({ success: false, error: 'Devis introuvable' });
    try {
      const profitability = profitabilityService.saveQuoteCostForecast(quoteId, req.body, req.session?.user?.id);
      return res.json({ success: true, profitability });
    } catch (error) {
      return res.status(400).json({ success: false, error: error.message || 'Chiffrage invalide' });
    }
  }

  return { getQuoteProfitability, saveQuoteCostForecast };
}

module.exports = { createQuoteProfitabilityController };
