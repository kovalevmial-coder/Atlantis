// Первый запуск: файл .env со случайными ключами, создание таблиц и тестовых данных.
// npm run setup — всё сразу; npm run db:init — только пустые таблицы; npm run seed — таблицы и тестовые данные заново
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const envFile = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envFile)) {
  fs.writeFileSync(envFile, [
    '# Настройки сервера «Атлантис». Файл создан автоматически, в git не попадает.',
    'PORT=3000',
    'HTTPS_PORT=3443',
    'DB_HOST=localhost',
    'DB_PORT=5432',
    'DB_NAME=atlantis',
    'DB_USER=atlantis',
    'DB_PASSWORD=atlantis',
    `SESSION_SECRET=${crypto.randomBytes(32).toString('hex')}`,
    `ENC_KEY=${crypto.randomBytes(32).toString('hex')}`,
    '# Папка с pg_dump.exe и pg_restore.exe (Windows), например C:\\Program Files\\PostgreSQL\\16\\bin',
    'PG_BIN=',
    '# Почта для кодов и временных паролей. Пусто — письма выводятся в консоль',
    'SMTP_HOST=',
    'SMTP_PORT=465',
    'SMTP_USER=',
    'SMTP_PASS=',
    'MAIL_FROM=Атлантис <no-reply@atlantis.by>',
    ''
  ].join('\n'));
  console.log('Создан файл .env со случайными ключами');
}

const { pool } = require('../config/db');
const seed = require('./seed');

(async () => {
  const mode = process.argv[2] || 'all';
  try {
    await pool.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
    console.log('Таблицы созданы');
    if (mode !== 'schema') {
      await seed();
      console.log('Тестовые данные загружены');
      console.log('\nВход (пароль у всех Atlantis2026):\n  директор  director@atlantis.by\n  учитель   teacher@atlantis.by\n  родитель  parent@atlantis.by');
    }
  } catch (err) {
    console.error('Ошибка:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
