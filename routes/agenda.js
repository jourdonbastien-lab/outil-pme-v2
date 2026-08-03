'use strict';

function registerAgendaPageRoute(app, { requireLogin, controller }) {
  app.get('/agenda', requireLogin, controller.showAgenda);
}

function registerAgendaMutationRoutes(app, { requireLogin, controller }) {
  app.post('/agenda/add', requireLogin, controller.createEvent);
  app.post('/agenda/update', requireLogin, controller.updateEvent);
  app.post('/agenda/delete', requireLogin, controller.deleteEvent);
}

module.exports = { registerAgendaPageRoute, registerAgendaMutationRoutes };
