'use strict';

function createClientFolderNavigationController(dependencies) {
  const { navigationService, renderView, pageTemplate, escapeHtml, pcFolderIcon } = dependencies;
  if (!navigationService) throw new TypeError('Service navigation clients manquant.');
  if (typeof renderView !== 'function') throw new TypeError('Vue navigation clients manquante.');
  if (typeof pageTemplate !== 'function') throw new TypeError('Template de page manquant.');

  function showClientFolders(req, res) {
    const model = navigationService.buildClientFolderNavigationModel(req.params.client);
    if (!model.exists) return res.status(404).send('Client introuvable sur le PC');
    const html = renderView({
      ...model,
      currentUser: req.session?.user || null,
      isWorkshop: req.session?.user?.role === 'atelier',
      escapeHtml,
      pcFolderIcon
    });
    return res.send(pageTemplate(req, `Client : ${model.client}`, html));
  }

  return { showClientFolders };
}

module.exports = { createClientFolderNavigationController };
