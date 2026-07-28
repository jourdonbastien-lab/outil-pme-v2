'use strict';

function createQuoteSketchesController({ sketchesService }) {
  function serveQuoteSketch(req, res) {
    const quoteId = Number(req.params.id);
    const quote = Number.isFinite(quoteId) && quoteId > 0 ? sketchesService.findQuote(quoteId) : null;
    if (!quote) return res.status(404).send('Devis introuvable');
    const filePath = sketchesService.getQuoteSketch(quoteId);
    if (!filePath) return res.status(404).send('Croquis introuvable');
    return res.sendFile(filePath);
  }
  function saveQuoteSketch(req, res) {
    const quoteId = Number(req.params.id);
    const quote = Number.isFinite(quoteId) && quoteId > 0 ? sketchesService.findQuote(quoteId) : null;
    if (!quote) return res.status(404).json({ ok: false, error: 'Devis introuvable' });
    try {
      const filePath = sketchesService.saveQuoteSketch(quoteId, req.body?.image);
      return res.json({ ok: true, path: filePath });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ ok: false, error: error.message || 'Erreur sauvegarde croquis' });
    }
  }
  return { serveQuoteSketch, saveQuoteSketch };
}

module.exports = { createQuoteSketchesController };
