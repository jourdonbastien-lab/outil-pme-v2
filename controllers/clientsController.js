'use strict';

function createClientsController(dependencies) {
  const {
    clientsService,
    renderListView,
    renderClientCard,
    pageTemplate,
    escapeHtml,
    clientPageIcon,
    safeName,
    logRequestBody = console.log
  } = dependencies || {};
  if (!clientsService) throw new TypeError('Service clients manquant.');
  if (typeof renderListView !== 'function') throw new TypeError('Vue clients manquante.');
  if (typeof pageTemplate !== 'function') throw new TypeError('Template de page manquant.');

  function showClients(req, res) {
    const clients = clientsService.buildMergedClientList();
    const clientCreateError = String(req.query.error || '').trim();
    const html = renderListView({
      clients,
      clientCreateError,
      clientCreateOpen: Boolean(clientCreateError),
      currentUser: req.session?.user || null,
      isWorkshop: req.session?.user?.role === 'atelier',
      escapeHtml,
      clientPageIcon,
      renderClientCard
    });
    return res.send(pageTemplate(req, 'Clients', html));
  }

  function createClient(req, res) {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).send('Nom requis');
    clientsService.createClient({
      name,
      address: String(req.body.address || '').trim(),
      postal_code: String(req.body.postal_code || '').trim(),
      city: String(req.body.city || '').trim(),
      email: String(req.body.email || '').trim(),
      phone: String(req.body.phone || '').trim()
    });
    return res.redirect('/clients');
  }

  function showClient(req, res) {
    const clientFolder = safeName(req.params.client);
    return res.redirect(`/pc-folders/${encodeURIComponent(clientFolder)}`);
  }

  function redirectPcFoldersToClients(req, res) {
    return res.redirect('/clients');
  }

  function deleteClient(req, res) {
    logRequestBody(req.body);
    clientsService.deleteClient(req.body.id);
    return res.redirect('/clients');
  }

  return { showClients, createClient, showClient, redirectPcFoldersToClients, deleteClient };
}

module.exports = { createClientsController };
