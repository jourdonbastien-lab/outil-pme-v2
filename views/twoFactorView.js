'use strict';

function createTwoFactorView({ escapeHtml } = {}) {
  function renderAuthPage({ title, body }) {
    return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - A2 METAL</title>
  <link rel="stylesheet" href="/style.css?v=20260711-2" />
</head>
<body class="login-body">
  <div class="login-wrapper">
    <div class="login-card">
      <div class="login-logo">A2 MÉTAL</div>
      ${body}
    </div>
  </div>
</body>
</html>
`;
  }

  function renderEmailPage(error = '') {
    return renderAuthPage({
      title: 'Vérification email',
      body: `
      <h1>Vérification email</h1>
      <p class="login-help">Saisissez une adresse e-mail autorisée pour recevoir votre code.</p>
      ${error ? `<p class="login-error">${escapeHtml(error)}</p>` : ''}
      <form method="POST" action="/login/email">
        <label for="email">Adresse e-mail</label>
        <input
          id="email"
          type="email"
          name="email"
          autocomplete="email"
          required
        />
        <button type="submit">Envoyer le code</button>
      </form>
      <form method="GET" action="/logout" class="login-secondary-form">
        <button type="submit" class="btn-secondary">Retour à la connexion</button>
      </form>
    `
    });
  }

  function renderCodePage(error = '') {
    return renderAuthPage({
      title: 'Code de vérification',
      body: `
      <h1>Vérification email</h1>
      <p class="login-help">Un code de sécurité vous a été envoyé par email.</p>
      ${error ? `<p class="login-error">${escapeHtml(error)}</p>` : ''}
      <form method="POST" action="/login/code">
        <label for="code">Code</label>
        <input
          id="code"
          class="login-code-input"
          type="text"
          name="code"
          inputmode="numeric"
          autocomplete="one-time-code"
          pattern="[0-9]{6}"
          maxlength="6"
          required
        />
        <button type="submit">Valider le code</button>
      </form>
      <form method="POST" action="/login/email" class="login-secondary-form">
        <button type="submit" class="btn-secondary">Renvoyer un code</button>
      </form>
      <a class="login-back-link" href="/logout">Retour à la connexion</a>
    `
    });
  }

  return { renderEmailPage, renderCodePage };
}

module.exports = { createTwoFactorView };
