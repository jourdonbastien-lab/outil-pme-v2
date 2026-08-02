'use strict';

function createQuoteDetailService(dependencies = {}) {
  const {
    db, quoteAttachmentsService, quoteSketchesService, quoteProfitabilityService,
    round2, normalizeVatRate, normalizeQuoteStatus, quotePhotoDirectory, fileExists, log = console.log
  } = dependencies;
  if (!db || typeof db.prepare !== 'function') throw new TypeError('Base détail devis manquante.');
  if (!quoteAttachmentsService || typeof quoteAttachmentsService.listQuoteAttachments !== 'function') throw new TypeError('Service pièces jointes devis manquant.');
  if (!quoteSketchesService || typeof quoteSketchesService.getQuoteSketch !== 'function') throw new TypeError('Service croquis devis manquant.');
  if (!quoteProfitabilityService || typeof quoteProfitabilityService.getQuoteProfitability !== 'function') throw new TypeError('Service rentabilité devis manquant.');
  if (typeof round2 !== 'function' || typeof normalizeVatRate !== 'function' || typeof normalizeQuoteStatus !== 'function') {
    throw new TypeError('Helpers détail devis manquants.');
  }
  if (typeof quotePhotoDirectory !== 'function' || typeof fileExists !== 'function') throw new TypeError('Helpers fichiers détail devis manquants.');

  function getQuoteDetail(id) {
    const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id);
    if (!quote) return null;
    const photoDir = quotePhotoDirectory(id);
    log('LECTURE FICHIERS DEVIS', { id, photoDir, exists: fileExists(photoDir) });
    const photos = quoteAttachmentsService.listQuoteAttachments(id);
    const materials = db.prepare('SELECT * FROM materials ORDER BY COALESCE(type,\'\'), name').all()
      .map((material) => ({ ...material, type_safe: String(material.type || '') }));
    const lines = db.prepare('SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY position ASC, id ASC').all(id);
    const total = lines.reduce((sum, line) => sum + (Number(line.total) || 0), 0);
    const acceptDisabled = String(quote.status || '') === 'Accepté';
    const marginPct = Number(quote.margin_pct ?? 0);
    const totalWithMargin = round2(total * (1 + marginPct / 100));
    const profitabilityContext = quoteProfitabilityService.getQuoteProfitability(id);
    const profitabilitySaved = profitabilityContext.saved;
    const profitabilityForecast = profitabilityContext.calculations;
    const vatRate = normalizeVatRate(quote.vat_rate);
    const tva = round2(total * (vatRate / 100));
    const totalTtc = round2(total + tva);
    const quoteStatus = normalizeQuoteStatus(quote.status);
    const linkedMeasurements = db.prepare('SELECT * FROM measurements WHERE quote_id = ? ORDER BY updated_at DESC, id DESC').all(id);
    const sketchPath = quoteSketchesService.getQuoteSketch(id);
    return {
      id, quote, photos, materials, lines, total, acceptDisabled, marginPct, totalWithMargin,
      profitabilityContext, profitabilitySaved, profitabilityForecast, vatRate, tva, totalTtc,
      quoteStatus, linkedMeasurements, sketch: { exists: Boolean(sketchPath), path: sketchPath, url: `/sketches/quotes/${id}.png` }
    };
  }

  return { getQuoteDetail };
}

module.exports = { createQuoteDetailService };
