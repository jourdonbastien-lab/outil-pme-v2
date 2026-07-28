'use strict';

function createQuoteSettingsService(dependencies) {
  const { db, removeQuotePhotos, removeQuoteSketch } = dependencies || {};
  if (!db || typeof db.prepare !== 'function') throw new TypeError('Base paramètres devis manquante.');

  function updateQuoteNotes(quoteId, notes) {
    return db.prepare('UPDATE quotes SET notes = ? WHERE id = ?').run(notes, quoteId);
  }
  function updateQuoteStatus(quoteId, status) {
    return db.prepare('UPDATE quotes SET status = ? WHERE id = ?').run(status, quoteId);
  }
  function updateQuoteVat(quoteId, vatRate) {
    return db.prepare('UPDATE quotes SET vat_rate = ? WHERE id = ?').run(vatRate, quoteId);
  }
  function updateQuoteMargin(quoteId, margin) {
    return db.prepare('UPDATE quotes SET margin_pct = ? WHERE id = ?').run(margin, quoteId);
  }
  function findQuoteById(quoteId) {
    return db.prepare('SELECT id FROM quotes WHERE id = ?').get(quoteId);
  }
  function deleteQuote(quoteId) {
    db.prepare('DELETE FROM quote_lines WHERE quote_id = ?').run(quoteId);
    db.prepare('DELETE FROM quotes WHERE id = ?').run(quoteId);
    removeQuotePhotos(quoteId);
    removeQuoteSketch(quoteId);
  }
  return { updateQuoteNotes, updateQuoteStatus, updateQuoteVat, updateQuoteMargin, findQuoteById, deleteQuote };
}

module.exports = { createQuoteSettingsService };
