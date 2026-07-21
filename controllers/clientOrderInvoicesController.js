'use strict';
function createClientOrderInvoicesController(d = {}) {
  const functions = ['uploadInvoice', 'renderValidationPage', 'validateExistingInvoiceFile', 'basename', 'getPurchaseOrderRedirect',
    'parseDecimalInput', 'hasDecimalInput', 'roundAmount', 'invoiceTotalsAreConsistent', 'fileSha256', 'safeResolveInside',
    'fileExists', 'clientOrderInvoicesDir', 'uniqueFilePath', 'copyFile', 'deleteFile', 'getClientOrderFinancialSnapshot',
    'renderClientOrderInvoicesView', 'escapeHtml', 'formatEuroFr', 'clientPageIcon', 'pcFolderIcon', 'isoDate'];
  if (!d.invoiceService || typeof d.invoiceService.getOrderById !== 'function') throw new Error('createClientOrderInvoicesController: invoiceService is required');
  for (const name of functions) if (typeof d[name] !== 'function') throw new Error(`createClientOrderInvoicesController: ${name} is required`);
  if (typeof d.scanDirectory !== 'string') throw new Error('createClientOrderInvoicesController: scanDirectory is required');
  const s = d.invoiceService;
  const invoiceRedirect = (order) => d.getPurchaseOrderRedirect(order).replace('/Commandes', '/Factures');

  function getInvoicesFolderData(orderDb) {
    if (!orderDb) return { invoices: [], snapshot: null, analyzedFileNames: new Set() };
    return {
      invoices: s.listInvoicesByOrderId(orderDb.id),
      snapshot: d.getClientOrderFinancialSnapshot(orderDb.id),
      analyzedFileNames: new Set(s.listAnalyzedFileNames(orderDb.id).map((row) => d.basename(String(row.stored_file_name || ''))))
    };
  }
  function renderInvoicesFolder(context) {
    const folder = getInvoicesFolderData(context.orderDb);
    return d.renderClientOrderInvoicesView({ ...context, ...folder, escapeHtml: d.escapeHtml, formatEuroFr: d.formatEuroFr, clientPageIcon: d.clientPageIcon, pcFolderIcon: d.pcFolderIcon });
  }
  function renderInvoiceFileAction(context) {
    return d.renderClientOrderInvoicesView({ ...context, mode: 'fileAction', escapeHtml: d.escapeHtml });
  }
  function analyzeInvoice(req, res) {
    const orderId = Number(req.params.id || 0);
    const order = s.getOrderById(orderId);
    if (!order) return res.status(404).send('Commande introuvable');
    d.uploadInvoice(req, res, async (err) => {
      const fallbackUrl = invoiceRedirect(order);
      if (err) return res.redirect(`${fallbackUrl}?error=${encodeURIComponent(err.message || 'Upload facture impossible')}`);
      if (!req.file) return res.redirect(`${fallbackUrl}?error=Aucun+fichier+recu`);
      try {
        return await d.renderValidationPage(req, res, { orderId, scanFileName: req.file.filename, scanOriginalName: req.file.originalname || req.file.filename, mimeType: req.file.mimetype });
      } catch (error) {
        return res.redirect(`${fallbackUrl}?error=${encodeURIComponent(error.message || 'Analyse facture impossible')}`);
      }
    });
  }
  async function analyzeExistingInvoice(req, res) {
    const orderId = Number(req.params.id || 0);
    const order = s.getOrderById(orderId);
    if (!order) return res.status(404).send('Commande introuvable');
    const fallbackUrl = invoiceRedirect(order);
    try {
      const existingFileName = d.basename(String(req.body.invoice_file_name || ''));
      d.validateExistingInvoiceFile(order, existingFileName);
      return await d.renderValidationPage(req, res, { orderId, sourceType: 'existing', existingFileName });
    } catch (error) {
      return res.redirect(`${fallbackUrl}?error=${encodeURIComponent(error.message || 'Analyse facture impossible')}`);
    }
  }
  function createClientOrderInvoice(req, res) {
    const orderId = Number(req.params.id || 0);
    const order = s.getOrderById(orderId);
    if (!order) return res.status(404).send('Commande introuvable');
    const redirectUrl = invoiceRedirect(order);
    try {
      const sourceType = req.body.source_type === 'existing' ? 'existing' : 'upload';
      const existing = sourceType === 'existing' ? d.validateExistingInvoiceFile(order, req.body.existing_file) : null;
      const scanFileName = sourceType === 'upload' ? d.basename(String(req.body.scan_file || '')) : '';
      const originalFileName = sourceType === 'upload' ? d.basename(String(req.body.scan_original_name || scanFileName)) : existing.fileName;
      if (sourceType === 'upload' && !scanFileName) return res.status(400).send('Fichier facture manquant');
      const scanPath = sourceType === 'upload' ? d.safeResolveInside(d.scanDirectory, scanFileName) : existing.filePath;
      if (!d.fileExists(scanPath)) return res.status(400).send('Fichier facture introuvable. Relancez le scan.');
      const invoiceNumber = String(req.body.invoice_number || '').trim();
      const invoiceDate = String(req.body.invoice_date || '').trim() || d.isoDate();
      const clientName = String(req.body.client_name || '').trim() || order.name || '';
      const amountHt = d.parseDecimalInput(req.body.amount_ht, 0);
      const vatAmount = d.parseDecimalInput(req.body.vat_amount, 0);
      const amountTtc = d.hasDecimalInput(req.body.amount_ttc) ? d.parseDecimalInput(req.body.amount_ttc, 0) : d.roundAmount(amountHt + vatAmount);
      if (amountHt <= 0) return res.status(400).send('Montant HT facture positif requis');
      if (vatAmount < 0) return res.status(400).send('Montant TVA negatif impossible');
      if (amountTtc <= 0) return res.status(400).send('Montant TTC facture positif requis');
      if (!d.invoiceTotalsAreConsistent(amountHt, vatAmount, amountTtc)) return res.status(400).send('Les montants ne correspondent pas: HT + TVA doit etre proche du TTC. Corrigez les champs puis validez.');
      const hash = d.fileSha256(scanPath);
      if (s.findDuplicate(orderId, invoiceNumber, hash)) return res.status(409).send('Facture deja enregistree pour cette commande.');
      let storedFileName = originalFileName;
      if (sourceType === 'upload') {
        const destinationPath = d.uniqueFilePath(d.clientOrderInvoicesDir(order), originalFileName || scanFileName);
        d.copyFile(scanPath, destinationPath); storedFileName = d.basename(destinationPath);
      }
      s.createInvoice({ orderId, invoiceNumber, invoiceDate, clientName, amountHt, vatAmount, amountTtc, storedFileName, originalFileName, fileHash: hash, sourceType, createdAt: new Date().toISOString() });
      if (sourceType === 'upload') { try { d.deleteFile(scanPath); } catch {} }
      return res.redirect(redirectUrl);
    } catch (error) {
      return res.status(500).send(`Erreur creation facture EBP: ${d.escapeHtml(error.message || 'inconnue')}`);
    }
  }
  function deleteClientOrderInvoice(req, res) {
    const orderId = Number(req.params.id || 0); const invoiceId = Number(req.params.invoiceId || 0);
    const order = s.getOrderById(orderId); if (!order) return res.status(404).send('Commande introuvable');
    const invoice = s.getInvoiceById(invoiceId, orderId); if (!invoice) return res.status(404).send('Facture introuvable');
    s.deleteInvoiceRecord(invoiceId, orderId);
    if (invoice.stored_file_name && invoice.source_type !== 'existing') {
      try { const filePath = d.safeResolveInside(d.clientOrderInvoicesDir(order), d.basename(invoice.stored_file_name)); if (d.fileExists(filePath)) d.deleteFile(filePath); }
      catch (error) { console.warn('Suppression fichier facture impossible:', error.message); }
    }
    return res.redirect(invoiceRedirect(order));
  }
  return { getInvoicesFolderData, renderInvoicesFolder, renderInvoiceFileAction, analyzeInvoice, analyzeExistingInvoice, createClientOrderInvoice, deleteClientOrderInvoice };
}
module.exports = { createClientOrderInvoicesController };
