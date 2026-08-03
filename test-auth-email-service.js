'use strict';
const assert = require('assert');
const { createAuthEmailService } = require('./services/authEmailService');
(async () => {
  let options; let message;
  const service = createAuthEmailService({ nodemailer: { createTransport(value) { options = value; return { async sendMail(mail) { message = mail; } }; } }, smtpHost: 'smtp.example.invalid', smtpPort: 587, smtpSecure: false, smtpUser: 'user-test', smtpPass: 'pass-test', smtpFrom: 'from@example.invalid', codeTtlMinutes: 10 });
  await service.sendTwoFactorCode('to@example.invalid', '123456');
  assert.deepStrictEqual(options, { host: 'smtp.example.invalid', port: 587, secure: false, auth: { user: 'user-test', pass: 'pass-test' } });
  assert.strictEqual(message.from, 'from@example.invalid');
  assert.strictEqual(message.to, 'to@example.invalid');
  assert.strictEqual(message.subject, 'Code de vérification Outil PME');
  assert(message.text.includes('123456'));
  assert(message.text.includes('10 minutes'));
  const missing = createAuthEmailService({ nodemailer: {}, smtpHost: '', smtpFrom: '', codeTtlMinutes: 10 });
  await assert.rejects(() => missing.sendTwoFactorCode('to@example.invalid', '123456'), /Configuration SMTP incomplète/);
  const failing = createAuthEmailService({ nodemailer: { createTransport: () => ({ sendMail: async () => { throw new Error('SMTP test'); } }) }, smtpHost: 'smtp.example.invalid', smtpPort: 587, smtpSecure: false, smtpFrom: 'from@example.invalid', codeTtlMinutes: 10 });
  await assert.rejects(() => failing.sendTwoFactorCode('to@example.invalid', '123456'), /SMTP test/);
  console.log('OK - service e-mail Auth');
})().catch((error) => { console.error(error); process.exitCode = 1; });
