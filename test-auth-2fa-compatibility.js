'use strict';
const assert = require('assert');
const fs = require('fs');
const { createTwoFactorView } = require('./views/twoFactorView');
const currentServer = (fs.readFileSync('server.js', 'utf8') + fs.readFileSync('app/createApplication.js', 'utf8'));
const routes = fs.readFileSync('routes/auth.js', 'utf8');
for (const signature of ["get('/',", "get('/login',", "post('/login',", "get('/login/email',", "post('/login/email',", "get('/login/code',", "post('/login/code',", "get('/logout',"]) {
  assert(routes.includes(`app.${signature}`), `route extraite absente: ${signature}`);
}
for (const preserved of ['Login incorrect', 'Adresse e-mail non autorisée.', 'Code incorrect.', 'Le code a expiré. Demandez un nouveau code.', 'Trop de codes incorrects. Réessayez dans quelques minutes.', '/dashboard', '/login/email', '/login/code']) {
  assert((currentServer + fs.readFileSync('controllers/authController.js', 'utf8')).includes(preserved), `comportement absent: ${preserved}`);
}
const view = createTwoFactorView({ escapeHtml: String });
for (const html of [view.renderEmailPage(), view.renderCodePage()]) {
  for (const marker of ['<!DOCTYPE html>', '<div class="login-logo">A2 MÉTAL</div>', '/style.css?v=20260711-2']) assert(html.includes(marker));
}
console.log('OK - compatibilité Auth et 2FA');
