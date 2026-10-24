// Отправка писем. Без настроек SMTP письма выводятся в консоль (режим разработки).
const nodemailer = require('nodemailer');
const config = require('../config');

let transport = null;
if (config.mail.host) {
  transport = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.port === 465,
    auth: { user: config.mail.user, pass: config.mail.pass }
  });
}

async function send(to, subject, text) {
  if (!transport) {
    console.log(`\n[ПИСЬМО] Кому: ${to}\nТема: ${subject}\n${text}\n`);
    return { console: true };
  }
  await transport.sendMail({ from: config.mail.from, to, subject, text });
  return { console: false };
}

module.exports = { send, enabled: () => Boolean(transport) };
