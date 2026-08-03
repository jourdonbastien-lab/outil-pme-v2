'use strict';

const assert = require('assert');
const { CALENDAR_SCOPE, createGoogleCalendarService } = require('./services/googleCalendarService');

const calls = [];
const oauth2Client = {
  generateAuthUrl: (options) => { calls.push(['auth', options]); return 'https://google.test/auth'; },
  getToken: async (code) => ({ tokens: { access_token: `token-${code}` } }),
  setCredentials: (tokens) => calls.push(['credentials', tokens]),
};
const calendar = {
  calendarList: {
    get: async () => ({ data: { id: 'a2', summary: 'A2 Metal', timeZone: 'Europe/Paris' } }),
    list: async () => ({ data: { items: [] } }),
  },
  events: { delete: async (request) => calls.push(['delete', request]) },
};
const service = createGoogleCalendarService({
  google: { calendar: () => calendar }, oauth2Client,
  clientId: 'id', clientSecret: 'secret', redirectUri: 'callback',
  calendarId: 'a2', timeZone: 'Europe/Paris', logger: { error() {} },
});

(async () => {
  assert.strictEqual(service.isConfigured(), true);
  assert.strictEqual(service.getAuthorizationUrl(), 'https://google.test/auth');
  assert.deepStrictEqual(calls[0][1].scope, [CALENDAR_SCOPE]);
  assert.strictEqual(calls[0][1].access_type, 'offline');
  const tokens = await service.handleOAuthCallback('code');
  assert.strictEqual(tokens.access_token, 'token-code');
  assert.strictEqual((await service.getCalendarTarget(calendar)).summary, 'A2 Metal');
  await service.deleteEvent(tokens, 'event-1');
  assert.deepStrictEqual(calls.at(-1)[1], { calendarId: 'a2', eventId: 'event-1' });
  assert.strictEqual(JSON.stringify(service).includes('secret'), false);
  console.log('OK - service Google Calendar');
})().catch((error) => { console.error(error); process.exitCode = 1; });
