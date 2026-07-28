'use strict';

function createQuoteSketchesService(dependencies) {
  const { db, quoteSketchPath, saveQuoteSketchPng, fileExists, removeStoragePath } = dependencies || {};
  if (!db || typeof db.prepare !== 'function') throw new TypeError('Base croquis devis manquante.');
  if (typeof quoteSketchPath !== 'function') throw new TypeError('Chemin croquis devis manquant.');
  if (typeof saveQuoteSketchPng !== 'function') throw new TypeError('Sauvegarde croquis devis manquante.');

  function findQuote(quoteId) {
    return db.prepare('SELECT id FROM quotes WHERE id = ?').get(quoteId);
  }
  function getQuoteSketch(quoteId) {
    const filePath = quoteSketchPath(quoteId);
    return fileExists(filePath) ? filePath : null;
  }
  function saveQuoteSketch(quoteId, image) {
    return saveQuoteSketchPng(quoteId, image);
  }
  function deleteQuoteSketch(quoteId) {
    return removeStoragePath(quoteSketchPath(quoteId));
  }
  return { findQuote, getQuoteSketch, saveQuoteSketch, deleteQuoteSketch };
}

module.exports = { createQuoteSketchesService };
