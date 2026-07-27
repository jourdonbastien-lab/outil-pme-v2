'use strict';

function registerClientFolderRoutes(app, dependencies) {
  const { requireLogin, showClientFolders } = dependencies;
  if (!app || typeof app.get !== 'function') throw new TypeError('Application Express invalide.');
  if (typeof requireLogin !== 'function') throw new TypeError('Middleware requireLogin manquant.');
  if (typeof showClientFolders !== 'function') throw new TypeError('Gestionnaire navigation clients manquant.');
  app.get('/pc-folders/:client', requireLogin, showClientFolders);
}

module.exports = { registerClientFolderRoutes };
