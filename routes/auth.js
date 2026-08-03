'use strict';

function registerAuthRoutes(app, { requirePendingMfa, controller } = {}) {
  app.get('/', controller.home);
  app.get('/login', controller.showLogin);
  app.post('/login', controller.login);
  app.get('/login/email', requirePendingMfa, controller.showEmail);
  app.post('/login/email', requirePendingMfa, controller.sendEmail);
  app.get('/login/code', requirePendingMfa, controller.showCode);
  app.post('/login/code', requirePendingMfa, controller.verifyCode);
  app.get('/logout', controller.logout);
}

module.exports = { registerAuthRoutes };
