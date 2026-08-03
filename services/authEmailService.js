'use strict';

function createAuthEmailService({ nodemailer, smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, smtpFrom, codeTtlMinutes } = {}) {
  function getTransport() {
    if (!smtpHost || !smtpFrom) throw new Error('Configuration SMTP incomplète');
    const options = { host: smtpHost, port: smtpPort, secure: smtpSecure };
    if (smtpUser || smtpPass) options.auth = { user: smtpUser, pass: smtpPass };
    return nodemailer.createTransport(options);
  }

  async function sendTwoFactorCode(email, code) {
    const transport = getTransport();
    await transport.sendMail({
      from: smtpFrom,
      to: email,
      subject: 'Code de vérification Outil PME',
      text: [
        'Votre code de vérification Outil PME est :', '', code, '',
        `Ce code expire dans ${codeTtlMinutes} minutes.`,
        'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.'
      ].join('\n')
    });
  }

  return { sendTwoFactorCode };
}

module.exports = { createAuthEmailService };
