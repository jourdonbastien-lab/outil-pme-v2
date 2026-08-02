'use strict';

function createIncomingDocumentsController({ documentsService, importService, renderListView, pageTemplate, viewDependencies, uploadSingle, path, escHtml, maxFileSizeBytes } = {}) {
  function showIncomingDocuments(req, res) {
    const data = documentsService.listDocuments(req.query);
    return res.send(pageTemplate(req, 'Documents entrants', renderListView({ ...data, maxFileSizeBytes }, viewDependencies)));
  }
  function serveDocumentFile(req, res) {
    const row = documentsService.getDocumentById(req.params.id);
    if (!row) return res.status(404).send('Document introuvable');
    try {
      const filePath = documentsService.resolveDocumentFile(row);
      const disposition = req.query.download === '1' ? 'attachment' : 'inline';
      res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(path.basename(row.original_name))}`);
      return res.sendFile(filePath);
    } catch (error) { return res.status(404).send(escHtml(error.message)); }
  }
  function uploadDocument(req, res) {
    uploadSingle(req, res, async (uploadError) => {
      if (uploadError || !req.file) return res.status(400).send(escHtml(uploadError?.message || 'Document manquant'));
      try { await importService.registerUploadedDocument(req.file); return res.redirect('/documents-entrants'); }
      catch (error) { return res.status(400).send(escHtml(error.message)); }
    });
  }
  function classifyDocument(req, res) {
    const row = documentsService.getDocumentById(req.params.id);
    if (!row) return res.status(404).send('Document introuvable');
    try {
      const result = documentsService.classifyDocument(row, req.body, req.session.user.id);
      if (result.error) return res.status(400).send(result.error);
      return res.redirect('/documents-entrants');
    } catch (error) { return res.status(400).send(escHtml(error.message)); }
  }
  async function reanalyzeDocument(req, res) {
    const row = documentsService.getDocumentById(req.params.id);
    if (!row) return res.status(404).send('Document introuvable');
    try {
      documentsService.resolveDocumentFile(row);
      const result = await importService.reanalyzeDocument(row);
      if (result.busy) return res.status(409).send('Analyse déjà en cours');
      return res.redirect('/documents-entrants');
    } catch (error) { return res.status(400).send(escHtml(error.message)); }
  }
  function rejectDocument(req, res) {
    const row = documentsService.getDocumentById(req.params.id);
    if (!row) return res.status(404).send('Document introuvable');
    documentsService.rejectDocument(row, req.body.reason);
    return res.redirect('/documents-entrants?status=rejete');
  }
  return { showIncomingDocuments, serveDocumentFile, uploadDocument, classifyDocument, reanalyzeDocument, rejectDocument };
}

module.exports = { createIncomingDocumentsController };
