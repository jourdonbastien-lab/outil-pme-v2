'use strict';

function registerMaterialsRoutes(app, { requireLogin, requireAdmin, handlers }) {
  app.get('/materials', requireLogin, handlers.list);
  app.post('/materials', requireLogin, handlers.create);
  app.post('/materials/update', requireLogin, handlers.updateFromBody);
  app.post('/materials/seed', requireAdmin, handlers.seed);
  app.post('/materials/delete', requireLogin, handlers.delete);
  app.get('/materials/:id', requireLogin, handlers.detail);
  app.post('/materials/:id', requireLogin, handlers.update);
}

module.exports = { registerMaterialsRoutes };
