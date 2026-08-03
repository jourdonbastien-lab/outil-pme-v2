'use strict';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

function createGoogleCalendarService({
  google,
  oauth2Client,
  clientId,
  clientSecret,
  redirectUri,
  calendarId,
  timeZone,
  logger = console,
} = {}) {
  function isConfigured() {
    return Boolean(clientId && clientSecret && redirectUri && calendarId && calendarId !== 'primary');
  }

  function getAuthorizationUrl() {
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [CALENDAR_SCOPE],
      prompt: 'consent',
    });
  }

  async function handleOAuthCallback(code) {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    return tokens;
  }

  function createCalendar(tokens) {
    oauth2Client.setCredentials(tokens);
    return google.calendar({ version: 'v3', auth: oauth2Client });
  }

  async function getCalendarTarget(calendar) {
    if (calendarId === 'primary') {
      throw new Error('GOOGLE_CALENDAR_ID ne doit jamais valoir primary pour A2 Metal.');
    }
    const result = await calendar.calendarList.get({ calendarId });
    return {
      id: result.data.id || calendarId,
      summary: result.data.summary || calendarId,
      timeZone: result.data.timeZone || timeZone,
    };
  }

  async function listCalendars(tokens) {
    return createCalendar(tokens).calendarList.list();
  }

  async function deleteEvent(tokens, eventId) {
    return createCalendar(tokens).events.delete({ calendarId, eventId });
  }

  function logDeleteError(error) {
    logger.error('Erreur suppression Google Agenda :', error.response ? error.response.data : error);
  }

  return {
    isConfigured,
    getAuthorizationUrl,
    handleOAuthCallback,
    createCalendar,
    getCalendarTarget,
    listCalendars,
    deleteEvent,
    logDeleteError,
    calendarId,
    timeZone,
  };
}

module.exports = { CALENDAR_SCOPE, createGoogleCalendarService };
