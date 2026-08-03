'use strict';

function createGoogleCalendarController({
  googleCalendarService,
  agendaSyncService,
  pageTemplate,
  renderConfigurationError,
  renderSyncLockedView,
  renderSyncErrorView,
  renderSyncSummary,
  viewDependencies,
  logger = console,
} = {}) {
  let syncLocked = false;

  function ensureConfiguration(res) {
    if (googleCalendarService.isConfigured()) return true;
    res.status(500).send(renderConfigurationError());
    return false;
  }

  function connect(req, res) {
    if (!ensureConfiguration(res)) return;
    return res.redirect(googleCalendarService.getAuthorizationUrl());
  }

  async function callback(req, res) {
    if (!ensureConfiguration(res)) return;
    try {
      req.session.googleTokens = await googleCalendarService.handleOAuthCallback(req.query.code);
      return res.redirect('/agenda');
    } catch (error) {
      logger.error(error);
      return res.send('Erreur connexion Google');
    }
  }

  function syncRedirect(req, res) {
    return res.redirect('/agenda');
  }

  async function sync(req, res) {
    if (!ensureConfiguration(res)) return;
    if (!req.session.googleTokens) return res.redirect('/google/auth');
    if (syncLocked) {
      return res.status(409).send(pageTemplate(req, 'Synchronisation en cours', renderSyncLockedView()));
    }

    syncLocked = true;
    try {
      const result = await agendaSyncService.syncAgenda(req.session.googleTokens);
      const html = renderSyncSummary(result.report, { message: result.message }, viewDependencies);
      if (result.status === 'conflict') return res.status(409).send(pageTemplate(req, 'Synchronisation Google', html));
      return res.send(pageTemplate(req, 'Synchronisation Google', html));
    } catch (error) {
      logger.error('Erreur application Google Agenda :', error.response ? error.response.data : error);
      return res.status(502).send(pageTemplate(req, 'Erreur Google Agenda', renderSyncErrorView()));
    } finally {
      syncLocked = false;
    }
  }

  async function listCalendars(req, res) {
    if (!ensureConfiguration(res)) return;
    const result = await googleCalendarService.listCalendars(req.session.googleTokens);
    logger.log(result.data.items);
    return res.send('OK');
  }

  return { connect, callback, syncRedirect, sync, listCalendars };
}

module.exports = { createGoogleCalendarController };
