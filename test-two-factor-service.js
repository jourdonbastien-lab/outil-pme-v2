'use strict';
const assert = require('assert');
const realCrypto = require('crypto');
const { createTwoFactorService } = require('./services/twoFactorService');
let currentTime = 100000;
let generated = 7;
const crypto = {
  randomInt: () => generated,
  randomBytes: realCrypto.randomBytes,
  createHmac: realCrypto.createHmac,
  timingSafeEqual: realCrypto.timingSafeEqual
};
const service = createTwoFactorService({ crypto, sessionSecret: 'secret-de-test', allowedEmails: new Set(['test@example.invalid']), codeTtlMs: 600000, maxCodeAttempts: 5, lockMs: 900000, resendCooldownMs: 60000, requestWindowMs: 600000, maxRequestsPerWindow: 5, now: () => currentTime });
assert.strictEqual(service.normalizeEmail(' Test@Example.Invalid '), 'test@example.invalid');
assert(service.isEmailAllowed('test@example.invalid'));
assert(!service.isEmailAllowed('absent@example.invalid'));
assert.strictEqual(service.generateCode(), '000007', 'les zéros initiaux doivent être conservés');
const pending = { id: 3, username: 'Test', role: 'admin' };
const challenge = service.createChallenge(pending, 'test@example.invalid');
assert.strictEqual(challenge.code, '000007');
assert.strictEqual(challenge.mfa.expiresAt, 700000);
assert.strictEqual(challenge.mfa.attempts, 0);
assert.strictEqual(service.verifyChallenge(challenge.mfa, pending, '000007').status, 'success');
assert.strictEqual(service.verifyChallenge({ ...challenge.mfa }, pending, '12').status, 'invalid_format');
let wrong = { ...challenge.mfa };
for (let attempt = 1; attempt < 5; attempt += 1) assert.strictEqual(service.verifyChallenge(wrong, pending, '999999').status, 'incorrect');
const locked = service.verifyChallenge(wrong, pending, '999999');
assert.strictEqual(locked.status, 'locked');
assert.strictEqual(locked.mfa.attempts, 5);
assert.strictEqual(locked.mfa.lockUntil, 1000000);
assert(service.isLocked(locked.mfa));
currentTime = 700000;
assert.strictEqual(service.verifyChallenge({ ...challenge.mfa, lockUntil: 0 }, pending, '000007').status, 'expired');
currentTime = 100000;
const request = service.checkCodeRequestLimit('test@example.invalid', '127.0.0.1');
assert(request.ok);
service.registerCodeRequest(request.limit);
assert.strictEqual(service.checkCodeRequestLimit('test@example.invalid', '127.0.0.1').ok, false, 'cooldown de renvoi conservé');
currentTime += 60001;
assert(service.checkCodeRequestLimit('test@example.invalid', '127.0.0.1').ok);
generated = 123456;
const replacement = service.createChallenge(pending, 'test@example.invalid');
assert.strictEqual(service.verifyChallenge(replacement.mfa, pending, challenge.code).status, 'incorrect', 'un nouveau défi invalide l’ancien code');
console.log('OK - service 2FA e-mail');
