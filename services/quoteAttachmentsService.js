'use strict';

function createQuoteAttachmentsService(dependencies) {
  const {
    photosRoot,
    safeResolveInside,
    basename,
    fileExists,
    deleteFile,
    removeStoragePath,
    readDirectory
  } = dependencies || {};
  if (!photosRoot) throw new TypeError('Dossier photos devis manquant.');
  if (typeof safeResolveInside !== 'function') throw new TypeError('Résolution sécurisée photos manquante.');
  if (typeof basename !== 'function') throw new TypeError('Normalisation nom photo manquante.');
  if (typeof fileExists !== 'function') throw new TypeError('Vérification photo manquante.');
  if (typeof deleteFile !== 'function') throw new TypeError('Suppression photo manquante.');
  if (typeof removeStoragePath !== 'function') throw new TypeError('Suppression dossier photos manquante.');

  function uploadedPhotoPath(quoteId, file) {
    return file.path || safeResolveInside(photosRoot, String(quoteId), file.filename);
  }
  function getQuotePhoto(quoteId, fileName) {
    const filePath = safeResolveInside(photosRoot, String(quoteId), basename(fileName || ''));
    return fileExists(filePath) ? filePath : null;
  }
  function deleteQuotePhoto(quoteId, fileName) {
    const filePath = safeResolveInside(photosRoot, String(quoteId), basename(fileName || ''));
    if (fileExists(filePath)) deleteFile(filePath);
    return filePath;
  }
  function deleteAllQuotePhotos(quoteId) {
    return removeStoragePath(safeResolveInside(photosRoot, String(quoteId)));
  }
  function listQuoteAttachments(quoteId) {
    const directory = safeResolveInside(photosRoot, String(quoteId));
    if (!fileExists(directory) || typeof readDirectory !== 'function') return [];
    return readDirectory(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
  }
  return { uploadedPhotoPath, getQuotePhoto, deleteQuotePhoto, deleteAllQuotePhotos, listQuoteAttachments, fileExists };
}

module.exports = { createQuoteAttachmentsService };
