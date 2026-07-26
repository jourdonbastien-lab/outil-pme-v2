'use strict';

function createClientOrderFolderService(dependencies) {
  const { orderService, safeName, joinPath, supportedFolderTypes } = dependencies;
  if (!orderService) throw new TypeError('Service commandes clients manquant.');
  if (typeof safeName !== 'function') throw new TypeError('Normaliseur de nom manquant.');
  if (typeof joinPath !== 'function') throw new TypeError('Constructeur de chemin manquant.');
  const types = Object.freeze([...supportedFolderTypes]);

  const getOrderFolderName = (order) =>
    safeName(order?.description && String(order.description).trim() !== '' ? order.description : `Commande_${order?.id}`);

  function resolveClientOrder(clientFolder, orderFolder) {
    const client = safeName(clientFolder);
    const order = safeName(orderFolder);
    return orderService.listAllOrdersNewestFirst()
      .find((row) => safeName(row.name) === client && getOrderFolderName(row) === order);
  }
  const resolveClientOrderById = (id) => orderService.getOrderById(id);

  const listSupportedFolderTypes = () => [...types];
  const isSupportedFolderType = (type) => types.includes(String(type || '').trim());
  const resolveFolderPath = (baseDir, client, order, type) =>
    joinPath(baseDir, safeName(client), safeName(order), String(type || '').trim());
  const getClientOrderFolderContext = ({ baseDir, client, order, type }) => ({
    client: safeName(client),
    order: safeName(order),
    type: String(type || '').trim(),
    orderDb: resolveClientOrder(client, order),
    folderPath: resolveFolderPath(baseDir, client, order, type)
  });
  const getClientOrderRootContext = ({ baseDir, client, order }) => ({
    client: safeName(client),
    order: safeName(order),
    orderDb: resolveClientOrder(client, order),
    folderPath: joinPath(baseDir, safeName(client), safeName(order))
  });

  return {
    getOrderFolderName,
    resolveClientOrderById,
    resolveClientOrder,
    getClientOrderFolderContext,
    getClientOrderRootContext,
    listSupportedFolderTypes,
    isSupportedFolderType,
    resolveFolderPath
  };
}

module.exports = { createClientOrderFolderService };
