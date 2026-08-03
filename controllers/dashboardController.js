'use strict';

function createDashboardController({ dashboardService, agendaService, renderDashboardView, renderDashboardClassicView, pageTemplate, viewDependencies }) {
  if (!dashboardService) throw new Error('dashboardService est requis');
  if (!agendaService || typeof agendaService.purgeExpiredEventsSafely !== 'function') throw new Error('agendaService.purgeExpiredEventsSafely est requis');
  if (typeof renderDashboardView !== 'function' || typeof renderDashboardClassicView !== 'function') throw new Error('vues Dashboard requises');
  if (typeof pageTemplate !== 'function') throw new Error('pageTemplate est requis');

  function showClassicDashboard(req, res) {
    const data = dashboardService.getClassicDashboardData();
    const body = renderDashboardClassicView({
      ...data,
      role: req.session?.user?.role,
      username: req.session.user.username
    }, viewDependencies);
    return res.send(pageTemplate(req, 'Dashboard', body));
  }

  function showDashboard(req, res) {
    agendaService.purgeExpiredEventsSafely();
    const data = dashboardService.getModernDashboardData();
    const body = renderDashboardView({
      ...data,
      userName: req.session?.user?.username || 'Utilisateur'
    }, viewDependencies);
    return res.send(pageTemplate(req, 'Dashboard', body));
  }

  function redirectDashboardPrototype(req, res) {
    return res.redirect('/dashboard');
  }

  function redirectDashboardPrototypeLegacy(req, res) {
    return res.redirect('/dashboard');
  }

  return { showDashboard, showClassicDashboard, redirectDashboardPrototype, redirectDashboardPrototypeLegacy };
}

module.exports = { createDashboardController };
