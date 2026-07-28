'use strict';

function createQuoteAttachmentsController(dependencies) {
  const {
    attachmentsService,
    uploadPhoto,
    log = console.log,
    warn = console.warn,
    logError = console.error
  } = dependencies || {};
  if (!attachmentsService) throw new TypeError('Service pièces jointes devis manquant.');
  if (typeof uploadPhoto !== 'function') throw new TypeError('Upload photo devis manquant.');

  function uploadQuotePhoto(req, res) {
    uploadPhoto(req, res, (error) => {
      const quoteId = Number(req.params.id || 0);
      if (!Number.isFinite(quoteId) || quoteId <= 0) return res.status(400).send('ID devis invalide');
      log('UPLOAD DEVIS', { id: req.params.id, file: req.file, body: req.body });
      if (error) {
        logError('Erreur upload fichier devis:', error);
        return res.status(400).send('Impossible d’ajouter ce fichier au devis.');
      }
      if (!req.file) {
        warn('UPLOAD DEVIS SANS FICHIER', { id: req.params.id, body: req.body });
        return res.status(400).send('Aucun fichier reçu. Vérifiez que le champ fichier du formulaire est bien renseigné.');
      }
      const savedPath = attachmentsService.uploadedPhotoPath(quoteId, req.file);
      log('UPLOAD DEVIS FICHIER SAUVEGARDE', {
        id: quoteId,
        destination: req.file.destination,
        filename: req.file.filename,
        path: savedPath,
        exists: attachmentsService.fileExists(savedPath),
        size: req.file.size
      });
      if (!attachmentsService.fileExists(savedPath)) {
        return res.status(500).send('Le fichier a été reçu mais n’a pas été retrouvé sur le disque.');
      }
      return res.redirect('/devis/' + quoteId);
    });
  }

  function serveQuotePhoto(req, res) {
    const quoteId = Number(req.params.id || 0);
    if (!Number.isFinite(quoteId) || quoteId <= 0) return res.status(400).send('ID devis invalide');
    const filePath = attachmentsService.getQuotePhoto(quoteId, req.params.file);
    if (!filePath) return res.status(404).send('Fichier introuvable');
    return res.sendFile(filePath);
  }

  function deleteQuotePhoto(req, res) {
    const quoteId = Number(req.params.id);
    if (!Number.isFinite(quoteId) || quoteId <= 0) return res.status(400).send('ID devis invalide');
    attachmentsService.deleteQuotePhoto(quoteId, req.body.photo || '');
    return res.redirect('/devis/' + quoteId);
  }

  return { uploadQuotePhoto, serveQuotePhoto, deleteQuotePhoto };
}

module.exports = { createQuoteAttachmentsController };
