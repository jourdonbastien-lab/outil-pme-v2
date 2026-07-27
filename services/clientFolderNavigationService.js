'use strict';

function createClientFolderNavigationService(dependencies) {
  const {
    clientsRoot,
    safeName,
    joinPath,
    folderExists,
    listDirectoryEntries,
    clientOrderFolderService
  } = dependencies;
  if (!clientsRoot) throw new TypeError('Racine des dossiers clients manquante.');
  if (typeof safeName !== 'function') throw new TypeError('Normaliseur de nom manquant.');
  if (typeof joinPath !== 'function') throw new TypeError('Constructeur de chemin manquant.');
  if (typeof folderExists !== 'function') throw new TypeError('Vérification de dossier manquante.');
  if (typeof listDirectoryEntries !== 'function') throw new TypeError('Lecture de dossier manquante.');
  if (!clientOrderFolderService || typeof clientOrderFolderService.resolveClientOrder !== 'function') {
    throw new TypeError('Service dossiers commandes manquant.');
  }

  function resolveClientFolder(clientValue) {
    const client = safeName(clientValue);
    const absolutePath = joinPath(clientsRoot, client);
    return { client, absolutePath, exists: folderExists(absolutePath) };
  }

  function enrichFolderWithClientOrder(client, folderName, absolutePath) {
    const matchedOrder = clientOrderFolderService.resolveClientOrder(client, folderName) || null;
    return {
      folderName,
      displayName: folderName,
      absolutePath,
      relativePath: joinPath(client, folderName),
      orderId: matchedOrder ? Number(matchedOrder.id) : null,
      matchedOrder,
      isHistorical: !matchedOrder,
      url: `/pc-folders/${encodeURIComponent(client)}/${encodeURIComponent(folderName)}`
    };
  }

  function listClientOrderFolders(clientFolder) {
    if (!clientFolder.exists) return [];
    return listDirectoryEntries(clientFolder.absolutePath)
      .filter((entry) => entry.isDirectory())
      .map((entry) => String(entry.name))
      .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
      .map((folderName) => enrichFolderWithClientOrder(
        clientFolder.client,
        folderName,
        joinPath(clientFolder.absolutePath, folderName)
      ));
  }

  function buildClientFolderNavigationModel(clientValue) {
    const clientFolder = resolveClientFolder(clientValue);
    return {
      client: clientFolder.client,
      absolutePath: clientFolder.absolutePath,
      exists: clientFolder.exists,
      folders: listClientOrderFolders(clientFolder)
    };
  }

  return {
    resolveClientFolder,
    listClientOrderFolders,
    enrichFolderWithClientOrder,
    buildClientFolderNavigationModel
  };
}

module.exports = { createClientFolderNavigationService };
