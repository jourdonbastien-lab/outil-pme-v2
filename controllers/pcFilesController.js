'use strict';

function createPcFilesController(dependencies = {}) {
  const { pcFilesService, renderPreviewView } = dependencies;

  function showFilePreview(req, res) {
    const context = pcFilesService.resolveFileContext(req.params);
    return res.send(renderPreviewView(context));
  }

  function serveRawFile(req, res) {
    const result = pcFilesService.resolveRawFile(req.params);
    if (result.error === 'invalid-type') return res.status(400).send('Type de dossier invalide');
    if (result.error === 'missing') return res.status(404).send('Fichier introuvable');
    if (result.error) return res.status(400).send('Chemin invalide');
    return res.sendFile(result.filePath);
  }

  function uploadFile(req, res) {
    if (!req.file) return res.status(400).send('Aucun fichier reçu');
    const context = pcFilesService.resolveUploadContext(req.params);
    return res.redirect(context.redirectUrl);
  }

  return { showFilePreview, serveRawFile, uploadFile };
}

module.exports = { createPcFilesController };
