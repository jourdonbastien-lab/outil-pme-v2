'use strict';

function createQuoteAiAnalysisController({ aiAnalysisService, parseOptionalId } = {}) {
  if (!aiAnalysisService) throw new TypeError('Service analyse IA devis manquant.');
  if (typeof parseOptionalId !== 'function') throw new TypeError('Validation identifiant devis manquante.');

  async function reviewQuote(req, res) {
    const quoteId = parseOptionalId(req.params.id);
    if (!quoteId) return res.status(400).json({ success: false, error: 'ID devis invalide' });
    const review = await aiAnalysisService.reviewQuote(quoteId, req.session?.user?.id);
    if (!review) return res.status(404).json({ success: false, error: 'Devis introuvable' });
    return res.json({ success: true, review });
  }

  function listQuoteAiReviews(req, res) {
    const quoteId = parseOptionalId(req.params.id);
    if (!quoteId) return res.status(400).json({ success: false, error: 'ID devis invalide' });
    if (!aiAnalysisService.quoteExists(quoteId)) return res.status(404).json({ success: false, error: 'Devis introuvable' });
    return res.json({ success: true, reviews: aiAnalysisService.listQuoteAiReviews(quoteId) });
  }

  function applyQuoteAiCosts(req, res) {
    const quoteId = parseOptionalId(req.params.id);
    if (!quoteId) return res.status(400).send('ID devis invalide');
    if (!aiAnalysisService.quoteExists(quoteId)) return res.status(404).send('Devis introuvable');
    try {
      aiAnalysisService.applyQuoteAiCosts(quoteId, req.body);
    } catch (error) {
      return res.status(400).send(error.message || 'Coûts invalides');
    }
    return res.redirect(`/devis/${quoteId}#quote-ai-review-card`);
  }

  return { reviewQuote, listQuoteAiReviews, applyQuoteAiCosts };
}

module.exports = { createQuoteAiAnalysisController };
