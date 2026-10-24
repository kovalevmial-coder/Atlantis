// Настройки приложения из файла .env
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const env = process.env;

module.exports = {
  port: Number(env.PORT || 3000),
  httpsPort: Number(env.HTTPS_PORT || 3443),
  isProd: env.NODE_ENV === 'production',
  db: {
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT || 5432),
    database: env.DB_NAME || 'atlantis',
    user: env.DB_USER || 'atlantis',
    password: env.DB_PASSWORD || 'atlantis'
  },
  sessionSecret: env.SESSION_SECRET || 'dev-session-secret',
  encKey: env.ENC_KEY || '',                 // 64 hex-символа = 32 байта для AES-256
  pgBin: env.PG_BIN || '',                   // папка с pg_dump и pg_restore
  mail: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT || 465),
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || 'Атлантис <no-reply@atlantis.by>'
  },
  siteUrl: env.SITE_URL || 'https://localhost:3443',
  rootDir: path.join(__dirname, '..'),
  siteDir: path.join(__dirname, '..', '..')  // папка со статическим сайтом (css, img, js)
};
