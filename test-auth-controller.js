'use strict';
const assert = require('assert');
const { createAuthController } = require('./controllers/authController');
function response() { return { code: 200, status(value) { this.code = value; return this; }, send(value) { this.body = value; return this; }, sendFile(value) { this.file = value; return this; }, redirect(value) { this.redirected = value; return this; } }; }
const rendered = { renderEmailPage: (error = '') => `email:${error}`, renderCodePage: (error = '') => `code:${error}` };
let authenticated = null; let sent = null; let verification = { status: 'success' }; let destroyed = false;
const authService = { authenticateUser: () => authenticated, buildPendingMfaUser: (user) => ({ id: user.id, username: user.username, role: user.role }), buildAuthenticatedSession: (user) => ({ id: user.id, username: user.username, role: user.role }) };
const twoFactorService = { normalizeEmail: (v) => String(v || '').trim().toLowerCase(), isLocked: (mfa) => Boolean(mfa?.locked), isEmailAllowed: (email) => email === 'ok@example.invalid', checkCodeRequestLimit: () => ({ ok: true, limit: {} }), createChallenge: () => ({ code: '123456', mfa: { codeHash: 'hash', email: 'ok@example.invalid' } }), registerCodeRequest() {}, verifyChallenge: () => verification };
const errors = [];
const controller = createAuthController({ authService, twoFactorService, authEmailService: { async sendTwoFactorCode(email, code) { sent = { email, code }; } }, twoFactorView: rendered, loginFilePath: '/public/login.html', getClientIp: () => '127.0.0.1', logger: { error: (...args) => errors.push(args) } });
(async () => {
  let req = { session: {} }; let res = response(); controller.home(req, res); assert.strictEqual(res.redirected, '/login');
  req = { session: { pendingMfaUser: { id: 1 } } }; res = response(); controller.home(req, res); assert.strictEqual(res.redirected, '/login/email');
  req.session.mfa = { codeHash: 'x' }; res = response(); controller.home(req, res); assert.strictEqual(res.redirected, '/login/code');
  res = response(); controller.showLogin({ session: {} }, res); assert.strictEqual(res.file, '/public/login.html');
  authenticated = null; res = response(); controller.login({ body: { username: 'x', password: 'y' }, session: {} }, res); assert.strictEqual(res.code, 401); assert.strictEqual(res.body, 'Login incorrect');
  authenticated = { id: 1, username: 'AdminTest', role: 'admin' }; req = { body: { username: ' AdminTest ', password: ' test ' }, session: { user: {}, mfa: {} } }; res = response(); controller.login(req, res); assert.deepStrictEqual(req.session, { pendingMfaUser: { id: 1, username: 'AdminTest', role: 'admin' } }); assert.strictEqual(res.redirected, '/login/email');
  res = response(); controller.showEmail(req, res); assert.strictEqual(res.body, 'email:');
  req.body = { email: 'absent@example.invalid' }; res = response(); await controller.sendEmail(req, res); assert.strictEqual(res.code, 403); assert.strictEqual(res.body, 'email:Adresse e-mail non autorisée.');
  req.body.email = 'ok@example.invalid'; res = response(); await controller.sendEmail(req, res); assert.deepStrictEqual(sent, { email: 'ok@example.invalid', code: '123456' }); assert.strictEqual(res.redirected, '/login/code');
  res = response(); controller.showCode({ session: {} }, res); assert.strictEqual(res.redirected, '/login/email');
  verification = { status: 'incorrect', mfa: { attempts: 1 } }; req = { body: { code: '999999' }, session: { pendingMfaUser: authenticated, mfa: {} } }; res = response(); controller.verifyCode(req, res); assert.strictEqual(res.code, 401); assert.strictEqual(req.session.mfa.attempts, 1);
  verification = { status: 'expired' }; res = response(); controller.verifyCode(req, res); assert.strictEqual(res.code, 400); assert(!req.session.mfa);
  verification = { status: 'success' }; req.session.mfa = {}; res = response(); controller.verifyCode(req, res); assert.deepStrictEqual(req.session, { user: { id: 1, username: 'AdminTest', role: 'admin' } }); assert.strictEqual(res.redirected, '/dashboard');
  req = { session: { destroy(callback) { destroyed = true; callback(); } } }; res = response(); controller.logout(req, res); assert(destroyed); assert.strictEqual(res.redirected, '/login');
  console.log('OK - contrôleur Auth et 2FA');
})().catch((error) => { console.error(error); process.exitCode = 1; });
