'use strict';

function registerWorkshopToolsRoutes(app, { requireLogin, handlers }) {
  if (!app || typeof app.get !== 'function') throw new Error('app.get est requis');
  if (typeof requireLogin !== 'function') throw new Error('requireLogin est requis');
  if (!handlers || typeof handlers.showLogibarre !== 'function') throw new Error('handlers.showLogibarre est requis');
  if (typeof handlers.showBarreaudage !== 'function') throw new Error('handlers.showBarreaudage est requis');
  if (typeof handlers.showLogitole !== 'function') throw new Error('handlers.showLogitole est requis');

  app.get('/outils/logibarre', requireLogin, handlers.showLogibarre);
  app.get('/outils/barreaudage', requireLogin, handlers.showBarreaudage);
  app.get('/outils/logitole', requireLogin, handlers.showLogitole);
}

module.exports = { registerWorkshopToolsRoutes };
