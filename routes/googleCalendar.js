'use strict';

function registerGoogleCalendarRoutes(app, { requireLogin, controller }) {
  app.get('/google/auth', requireLogin, controller.connect);
  app.get('/google/callback', requireLogin, controller.callback);
  app.get('/google/sync', requireLogin, controller.syncRedirect);
  app.post('/google/sync', requireLogin, controller.sync);
  app.get('/google/calendars', requireLogin, controller.listCalendars);
}

module.exports = { registerGoogleCalendarRoutes };
