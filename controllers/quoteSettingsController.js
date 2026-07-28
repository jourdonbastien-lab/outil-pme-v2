'use strict';

function createQuoteSettingsController({ quoteSettingsService, normalizeQuoteStatus }) {
  function validQuoteId(raw, res) {
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).send('ID devis invalide');
      return null;
    }
    return id;
  }
  function updateQuoteNotes(req, res) {
    quoteSettingsService.updateQuoteNotes(req.params.id, req.body.notes || '');
    return res.redirect('/devis/' + req.params.id);
  }
  function updateQuoteStatus(req, res) {
    const id = validQuoteId(req.params.id, res);
    if (id === null) return res;
    quoteSettingsService.updateQuoteStatus(id, normalizeQuoteStatus(req.body.status));
    return res.redirect('/devis/' + id);
  }
  function updateQuoteVat(req, res) {
    const id = validQuoteId(req.params.id, res);
    if (id === null) return res;
    const rate = Number(req.body.vat_rate);
    if (rate !== 10 && rate !== 20) return res.status(400).send('TVA invalide');
    quoteSettingsService.updateQuoteVat(id, rate);
    return res.redirect('/devis/' + id);
  }
  function updateQuoteMargin(req, res) {
    const id = validQuoteId(req.params.id, res);
    if (id === null) return res;
    const margin = Number(req.body.margin_pct || 0);
    if (!Number.isFinite(margin) || margin < 0) return res.status(400).send('Marge invalide');
    quoteSettingsService.updateQuoteMargin(id, margin);
    return res.redirect('/devis/' + id);
  }
  function deleteQuote(req, res) {
    const id = Number(req.params.id);
    if (!id) return res.status(400).send('ID devis invalide');
    if (!quoteSettingsService.findQuoteById(id)) return res.status(404).send('Devis introuvable');
    quoteSettingsService.deleteQuote(id);
    return res.redirect('/devis');
  }
  return { updateQuoteNotes, updateQuoteStatus, updateQuoteVat, updateQuoteMargin, deleteQuote };
}

module.exports = { createQuoteSettingsController };
