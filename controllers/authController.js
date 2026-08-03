'use strict';

function createAuthController(dependencies = {}) {
  const { authService, twoFactorService, authEmailService, twoFactorView, loginFilePath, getClientIp, logger = console } = dependencies;

  function home(req, res) {
    if (req.session.user) return res.redirect('/dashboard');
    if (req.session.pendingMfaUser) return req.session.mfa?.codeHash ? res.redirect('/login/code') : res.redirect('/login/email');
    return res.redirect('/login');
  }

  function showLogin(req, res) {
    if (req.session.user) return res.redirect('/dashboard');
    return res.sendFile(loginFilePath);
  }

  function login(req, res) {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '').trim();
    const user = authService.authenticateUser(username, password);
    if (!user) return res.status(401).send('Login incorrect');
    req.session.pendingMfaUser = authService.buildPendingMfaUser(user);
    delete req.session.user;
    delete req.session.mfa;
    return res.redirect('/login/email');
  }

  function showEmail(req, res) {
    return res.send(twoFactorView.renderEmailPage());
  }

  async function sendEmail(req, res) {
    const previousEmail = twoFactorService.normalizeEmail(req.session.mfa?.email);
    const email = twoFactorService.normalizeEmail(req.body.email || previousEmail);
    if (twoFactorService.isLocked(req.session.mfa)) {
      return res.status(429).send(twoFactorView.renderEmailPage('Trop de codes incorrects. Réessayez dans quelques minutes.'));
    }
    if (!twoFactorService.isEmailAllowed(email)) {
      return res.status(403).send(twoFactorView.renderEmailPage('Adresse e-mail non autorisée.'));
    }
    const requestCheck = twoFactorService.checkCodeRequestLimit(email, getClientIp(req));
    if (!requestCheck.ok) return res.status(429).send(twoFactorView.renderEmailPage(requestCheck.message));
    const challenge = twoFactorService.createChallenge(req.session.pendingMfaUser, email);
    req.session.mfa = challenge.mfa;
    try {
      await authEmailService.sendTwoFactorCode(email, challenge.code);
      twoFactorService.registerCodeRequest(requestCheck.limit);
    } catch (err) {
      delete req.session.mfa;
      logger.error('Erreur envoi code e-mail 2FA :', err.message);
      return res.status(500).send(twoFactorView.renderEmailPage('Impossible d’envoyer le code. Vérifiez la configuration SMTP.'));
    }
    return res.redirect('/login/code');
  }

  function showCode(req, res) {
    if (!req.session.mfa?.codeHash) return res.redirect('/login/email');
    return res.send(twoFactorView.renderCodePage());
  }

  function verifyCode(req, res) {
    const result = twoFactorService.verifyChallenge(req.session.mfa, req.session.pendingMfaUser, req.body.code);
    if (result.status === 'missing') return res.redirect('/login/email');
    if (result.status === 'locked') {
      if (result.mfa) req.session.mfa = result.mfa;
      return res.status(429).send(twoFactorView.renderCodePage('Trop de codes incorrects. Réessayez dans quelques minutes.'));
    }
    if (result.status === 'expired') {
      delete req.session.mfa;
      return res.status(400).send(twoFactorView.renderEmailPage('Le code a expiré. Demandez un nouveau code.'));
    }
    if (result.status === 'invalid_format') return res.status(400).send(twoFactorView.renderCodePage('Le code doit contenir 6 chiffres.'));
    if (result.status === 'incorrect') {
      req.session.mfa = result.mfa;
      return res.status(401).send(twoFactorView.renderCodePage('Code incorrect.'));
    }
    req.session.user = authService.buildAuthenticatedSession(req.session.pendingMfaUser);
    delete req.session.pendingMfaUser;
    delete req.session.mfa;
    return res.redirect('/dashboard');
  }

  function logout(req, res) {
    return req.session.destroy(() => res.redirect('/login'));
  }

  return { home, showLogin, login, showEmail, sendEmail, showCode, verifyCode, logout };
}

module.exports = { createAuthController };
