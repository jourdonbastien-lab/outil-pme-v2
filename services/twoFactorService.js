'use strict';

function createTwoFactorService(dependencies = {}) {
  const {
    crypto, sessionSecret, allowedEmails, codeTtlMs, maxCodeAttempts, lockMs,
    resendCooldownMs, requestWindowMs, maxRequestsPerWindow,
    now = () => Date.now(), requestLimits = new Map()
  } = dependencies;

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function isEmailAllowed(email) {
    return Boolean(email) && allowedEmails.has(email);
  }

  function isLocked(mfa) {
    return Boolean(mfa?.lockUntil && mfa.lockUntil > now());
  }

  function getRequestLimit(key) {
    const currentTime = now();
    const current = requestLimits.get(key);
    if (!current || current.windowExpiresAt <= currentTime) {
      const fresh = { count: 0, windowExpiresAt: currentTime + requestWindowMs, cooldownUntil: 0, lockUntil: 0 };
      requestLimits.set(key, fresh);
      return fresh;
    }
    return current;
  }

  function checkCodeRequestLimit(email, clientIp) {
    const limit = getRequestLimit(`${email}:${clientIp}`);
    const currentTime = now();
    if (limit.lockUntil > currentTime) return { ok: false, message: 'Trop de demandes de code. Réessayez dans quelques minutes.' };
    if (limit.cooldownUntil > currentTime) return { ok: false, message: 'Un code vient déjà d’être envoyé. Patientez avant de demander un nouveau code.' };
    if (limit.count >= maxRequestsPerWindow) {
      limit.lockUntil = currentTime + lockMs;
      return { ok: false, message: 'Trop de demandes de code. Réessayez dans quelques minutes.' };
    }
    return { ok: true, limit };
  }

  function registerCodeRequest(limit) {
    const currentTime = now();
    limit.count += 1;
    limit.cooldownUntil = currentTime + resendCooldownMs;
  }

  function generateCode() {
    return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  }

  function hashCode({ code, salt, userId, email }) {
    return crypto.createHmac('sha256', sessionSecret).update(`${userId}:${email}:${salt}:${code}`).digest('hex');
  }

  function timingSafeEqualHex(a, b) {
    const left = Buffer.from(String(a || ''), 'hex');
    const right = Buffer.from(String(b || ''), 'hex');
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  }

  function createChallenge(pendingUser, email) {
    const code = generateCode();
    const salt = crypto.randomBytes(16).toString('hex');
    return {
      code,
      mfa: {
        email, salt,
        codeHash: hashCode({ code, salt, userId: pendingUser.id, email }),
        expiresAt: now() + codeTtlMs, attempts: 0, lockUntil: 0, sentAt: now()
      }
    };
  }

  function verifyChallenge(mfa, pendingUser, submittedCode) {
    const code = String(submittedCode || '').trim();
    const currentTime = now();
    if (!mfa?.codeHash) return { status: 'missing' };
    if (mfa.lockUntil && mfa.lockUntil > currentTime) return { status: 'locked', mfa };
    if (!mfa.expiresAt || mfa.expiresAt <= currentTime) return { status: 'expired' };
    if (!/^\d{6}$/.test(code)) return { status: 'invalid_format', mfa };
    const submittedHash = hashCode({ code, salt: mfa.salt, userId: pendingUser.id, email: mfa.email });
    if (!timingSafeEqualHex(submittedHash, mfa.codeHash)) {
      mfa.attempts = Number(mfa.attempts || 0) + 1;
      if (mfa.attempts >= maxCodeAttempts) {
        mfa.lockUntil = currentTime + lockMs;
        return { status: 'locked', mfa };
      }
      return { status: 'incorrect', mfa };
    }
    return { status: 'success' };
  }

  return {
    normalizeEmail, isEmailAllowed, isLocked, checkCodeRequestLimit, registerCodeRequest,
    generateCode, createChallenge, verifyChallenge
  };
}

module.exports = { createTwoFactorService };
