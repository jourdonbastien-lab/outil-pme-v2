'use strict';

function createClientOrderFoldersController(dependencies) {
  const {
    folderService, hoursController, purchaseService, invoiceController,
    baseDir, folderExists, listFiles, extensionName, baseName, invoiceExtensions,
    fileIconName, renderFolderView, renderRootFolderView, renderFilesList, renderPurchasesBlock,
    pageTemplate, escapeHtml, clientPageIcon, pcFolderIcon,
    normalizePurchaseStatus, purchaseStatusClass, purchaseStatusOptions, formatDateLabel,
    ensureStandardSubfolders, workshopFolderTypes, listMeasurements, renderMeasurements,
    chantierStatusOptions
  } = dependencies;
  if (!folderService) throw new TypeError('Service dossiers commandes manquant.');
  if (!hoursController) throw new TypeError('Contrôleur heures manquant.');

  function showClientOrderFolder(req, res) {
    const type = String(req.params.type || '').trim();
    if (type === 'Heure chantier') return hoursController.showOrderHoursFolder(req, res);
    if (!folderService.isSupportedFolderType(type)) return res.status(400).send('Type de dossier invalide');

    const context = folderService.getClientOrderFolderContext({
      baseDir, client: req.params.client, order: req.params.order, type
    });
    if (!folderExists(context.folderPath)) return res.status(404).send('Dossier introuvable sur le PC');

    const fileNames = listFiles(context.folderPath);
    const invoiceData = type === 'Factures'
      ? invoiceController.getInvoicesFolderData(context.orderDb)
      : { analyzedFileNames: new Set() };
    const files = fileNames.map((name) => {
      const ext = extensionName(String(name || '')).toLowerCase();
      const canAnalyze = type === 'Factures' && context.orderDb && invoiceExtensions.has(ext);
      const normalizedName = baseName(name);
      const alreadyAnalyzed = canAnalyze && invoiceData.analyzedFileNames.has(normalizedName);
      return {
        name,
        iconName: fileIconName(name),
        invoiceAnalyzeAction: canAnalyze
          ? invoiceController.renderInvoiceFileAction({ orderDb: context.orderDb, fileName: normalizedName, alreadyAnalyzed })
          : ''
      };
    });
    const purchases = type === 'Commandes' && context.orderDb
      ? purchaseService.listPurchasesByOrderId(context.orderDb.id)
      : [];
    const viewDependencies = {
      type, orderDb: context.orderDb, purchases, escapeHtml, clientPageIcon,
      normalizePurchaseStatus, purchaseStatusClass, purchaseStatusOptions, formatDateLabel
    };
    const filesHtml = renderFilesList({
      files, client: context.client, order: context.order, type,
      escapeHtml, pcFolderIcon
    });
    const purchasesHtml = renderPurchasesBlock(viewDependencies);
    const invoicesHtml = type === 'Factures'
      ? invoiceController.renderInvoicesFolder({
        orderDb: context.orderDb, client: context.client, order: context.order, type
      })
      : '';
    const html = renderFolderView({
      client: context.client, order: context.order, type, files,
      filesHtml, purchasesHtml, invoicesHtml, escapeHtml, pcFolderIcon
    });
    return res.send(pageTemplate(req, `${type} - ${context.order}`, html));
  }

  function showClientOrderRootFolder(req, res) {
    const context = folderService.getClientOrderRootContext({
      baseDir, client: req.params.client, order: req.params.order
    });
    if (!folderExists(context.folderPath)) return res.status(404).send('Commande introuvable sur le PC');
    ensureStandardSubfolders(context.folderPath);
    const isWorkshop = req.session?.user?.role === 'atelier';
    const folders = folderService.listSupportedFolderTypes()
      .filter((type) => !isWorkshop || workshopFolderTypes.includes(type));
    const measurements = context.orderDb ? listMeasurements(context.orderDb.id) : [];
    const html = renderRootFolderView({
      client: context.client,
      order: context.order,
      folders,
      orderDb: context.orderDb,
      linkedMeasurementsHtml: renderMeasurements(measurements),
      escapeHtml,
      pcFolderIcon,
      clientPageIcon,
      chantierStatusOptions
    });
    return res.send(pageTemplate(req, `Commande : ${context.order}`, html));
  }

  return { showClientOrderFolder, showClientOrderRootFolder };
}

module.exports = { createClientOrderFoldersController };
