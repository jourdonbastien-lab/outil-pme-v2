'use strict';
const assert = require('assert');
const { createTwoFactorView } = require('./views/twoFactorView');
const view = createTwoFactorView({ escapeHtml: (value) => String(value).replace(/</g, '&lt;') });
const email = view.renderEmailPage('<Erreur>');
for (const value of ['method="POST" action="/login/email"', 'id="email"', 'type="email"', 'name="email"', 'autocomplete="email"', 'method="GET" action="/logout"', '&lt;Erreur>']) assert(email.includes(value), value);
const code = view.renderCodePage('<Erreur>');
for (const value of ['method="POST" action="/login/code"', 'id="code"', 'class="login-code-input"', 'name="code"', 'inputmode="numeric"', 'autocomplete="one-time-code"', 'pattern="[0-9]{6}"', 'maxlength="6"', 'Renvoyer un code', 'href="/logout"', '&lt;Erreur>']) assert(code.includes(value), value);
console.log('OK - vues 2FA e-mail');
