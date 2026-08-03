'use strict';

function createAgendaController({ agendaService, googleCalendarService, renderAgendaView, pageTemplate, viewDependencies } = {}) {
  function showAgenda(req, res) {
    agendaService.purgeExpiredEventsSafely();
    const requestedView = String(req.query.view || 'week').trim().toLowerCase();
    const requestedMonth = String(req.query.month || '').trim();
    const content = renderAgendaView({ events: agendaService.listEvents(), requestedView, requestedMonth }, viewDependencies);
    return res.send(pageTemplate(req, 'Agenda', content));
  }

  function createEvent(req, res) {
    agendaService.createEvent(req.body);
    return res.json({ success: true });
  }

  function updateEvent(req, res) {
    agendaService.updateEvent(req.body);
    return res.json({ success: true });
  }

  async function deleteEvent(req, res) {
    const event = agendaService.getEventById(req.body.id);
    if (event?.google_event_id && req.session.googleTokens) {
      try {
        await googleCalendarService.deleteEvent(req.session.googleTokens, event.google_event_id);
      } catch (error) {
        const status = error.response?.status || error.code;
        if (status !== 404 && status !== 410) {
          googleCalendarService.logDeleteError(error);
          return res.status(502).json({ success: false, error: 'Erreur suppression Google Agenda' });
        }
      }
    }
    agendaService.deleteEvent(req.body.id);
    return res.json({ success: true });
  }

  return { showAgenda, createEvent, updateEvent, deleteEvent };
}

module.exports = { createAgendaController };
