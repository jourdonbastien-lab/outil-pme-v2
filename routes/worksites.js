'use strict';

function registerWorksitesRoutes(app, { requireLogin, handlers }) {
  app.get('/chantiers', requireLogin, handlers.list);
  app.post('/chantiers', requireLogin, handlers.create);
  app.get('/chantiers/:id', requireLogin, handlers.detail);
  app.post('/chantiers/:id', requireLogin, handlers.update);
}

module.exports = { registerWorksitesRoutes };
