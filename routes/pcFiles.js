'use strict';

function registerPcFilesRoutes(app, dependencies = {}) {
  const { requireLogin, handlers } = dependencies;
  if (!app || typeof app.get !== 'function') throw new TypeError('Application Express invalide.');
  if (typeof requireLogin !== 'function') throw new TypeError('Middleware requireLogin manquant.');
  if (!handlers) throw new TypeError('Gestionnaires fichiers PC manquants.');
  if (typeof handlers.showFilePreview !== 'function') throw new TypeError('Gestionnaire showFilePreview manquant.');
  if (typeof handlers.serveRawFile !== 'function') throw new TypeError('Gestionnaire serveRawFile manquant.');

  app.get('/pc-file/:client/:order/:type/:file', requireLogin, handlers.showFilePreview);
  app.get('/pc-file-raw/:client/:order/:type/:file', requireLogin, handlers.serveRawFile);
}

module.exports = { registerPcFilesRoutes };
