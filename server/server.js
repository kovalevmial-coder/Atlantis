// Точка входа: HTTPS (если есть сертификат) или HTTP, плановые задачи
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const cron = require('node-cron');
const config = require('./config');
const { createApp } = require('./app');
const backup = require('./services/backupService');
const schedule = require('./services/scheduleService');
const dates = require('./utils/dates');

const certDir = path.join(__dirname, 'certs');
const keyFile = path.join(certDir, 'key.pem');
const certFile = path.join(certDir, 'cert.pem');
const hasCert = fs.existsSync(keyFile) && fs.existsSync(certFile);

if (hasCert) {
  const app = createApp({ secure: true });
  https.createServer({ key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }, app)
    .listen(config.httpsPort, () => console.log(`Атлантис: https://localhost:${config.httpsPort}`));
  // HTTP только перенаправляет на HTTPS
  http.createServer((req, res) => {
    const host = (req.headers.host || 'localhost').replace(/:\d+$/, '');
    res.writeHead(301, { Location: `https://${host}:${config.httpsPort}${req.url}` });
    res.end();
  }).listen(config.port, () => console.log(`HTTP ${config.port} → HTTPS ${config.httpsPort}`));
} else {
  createApp({ secure: false }).listen(config.port, () => {
    console.log(`Атлантис: http://localhost:${config.port}`);
    console.log('Сертификата нет: для HTTPS выполните npm run cert');
  });
}

// Каждую ночь: резервная копия БД и занятия на 8 недель вперёд
cron.schedule('0 3 * * *', async () => {
  try {
    await backup.create(null, 'auto');
    backup.prune();
  } catch (err) { console.error('Резервная копия не создана:', err.message); }
  try {
    await schedule.generateLessons(dates.today(), dates.addDays(dates.today(), 7 * 8));
  } catch (err) { console.error('Занятия не созданы:', err.message); }
});
