'use strict';

const assert = require('assert');
const { createGoogleCalendarController } = require('./controllers/googleCalendarController');

const service = {
  isConfigured: () => true,
  getAuthorizationUrl: () => 'https://google.test',
  handleOAuthCallback: async () => ({ access_token: 'fake' }),
  listCalendars: async () => ({ data: { items: [] } }),
};
const controller = createGoogleCalendarController({
  googleCalendarService: service,
  agendaSyncService: { syncAgenda: async () => ({ status: 'applied', report: {}, message: 'OK' }) },
  pageTemplate: (req, title, html) => `${title}:${html}`,
  renderConfigurationError: () => 'CONFIG', renderSyncLockedView: () => 'LOCKED', renderSyncErrorView: () => 'ERROR',
  renderSyncSummary: () => 'SUMMARY', viewDependencies: {}, logger: { log() {}, error() {} },
});
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, send(value) { this.body = value; return this; }, redirect(value) { this.redirectUrl = value; return this; } });

(async () => {
  let res = response(); controller.connect({}, res); assert.strictEqual(res.redirectUrl, 'https://google.test');
  res = response(); const callbackReq = { query: { code: 'code' }, session: {} }; await controller.callback(callbackReq, res);
  assert.strictEqual(callbackReq.session.googleTokens.access_token, 'fake'); assert.strictEqual(res.redirectUrl, '/agenda');
  res = response(); controller.syncRedirect({}, res); assert.strictEqual(res.redirectUrl, '/agenda');
  res = response(); await controller.sync({ session: {} }, res); assert.strictEqual(res.redirectUrl, '/google/auth');
  res = response(); await controller.sync({ session: { googleTokens: { access_token: 'fake' } } }, res); assert.strictEqual(res.body, 'Synchronisation Google:SUMMARY');
  console.log('OK - contrôleur Google Calendar');
})().catch((error) => { console.error(error); process.exitCode = 1; });
