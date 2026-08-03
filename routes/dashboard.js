'use strict';

function registerDashboardRoutes(app, { requireLogin, dashboardController, weatherController }) {
  if (!app || typeof app.get !== 'function') throw new Error('app.get est requis');
  if (typeof requireLogin !== 'function') throw new Error('requireLogin est requis');
  if (!dashboardController || !weatherController) throw new Error('contrôleurs Dashboard requis');
  app.get('/dashboard/classic', requireLogin, dashboardController.showClassicDashboard);
  app.get('/dashboard', requireLogin, dashboardController.showDashboard);
  app.get('/dashboard-prototype', requireLogin, dashboardController.redirectDashboardPrototype);
  app.get('/dashboard/prototype', requireLogin, dashboardController.redirectDashboardPrototypeLegacy);
  app.get('/api/weather', requireLogin, weatherController.getWeather);
}

module.exports = { registerDashboardRoutes };
