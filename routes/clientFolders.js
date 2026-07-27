'use strict';

function registerClientFolderRoutes(app, dependencies) {
  const { requireLogin, uploadSingleFile, handlers } = dependencies;
  if (!app || typeof app.get !== 'function' || typeof app.post !== 'function') {
    throw new TypeError('Application Express invalide.');
  }
  if (typeof requireLogin !== 'function') throw new TypeError('Middleware requireLogin manquant.');
  if (!handlers) throw new TypeError('Gestionnaires dossiers clients manquants.');
  if (typeof uploadSingleFile !== 'function') throw new TypeError('Middleware upload dossiers clients manquant.');
  for (const name of [
    'showClientFolders',
    'showClientOrderRootFolder',
    'showClientOrderFolder',
    'uploadClientOrderFolderFile'
  ]) {
    if (typeof handlers[name] !== 'function') throw new TypeError(`Gestionnaire ${name} manquant.`);
  }
  app.get('/pc-folders/:client', requireLogin, handlers.showClientFolders);
  app.get('/pc-folders/:client/:order', requireLogin, handlers.showClientOrderRootFolder);
  app.get('/pc-folders/:client/:order/:type', requireLogin, handlers.showClientOrderFolder);
  app.post(
    '/pc-folders/:client/:order/:type/upload',
    requireLogin,
    uploadSingleFile,
    handlers.uploadClientOrderFolderFile
  );
}

module.exports = { registerClientFolderRoutes };
