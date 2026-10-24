// Бизнес-операция 14: резервное копирование и восстановление БД (pg_dump / pg_restore)
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const config = require('../config');
const { AppError } = require('../utils/errors');
const { audit } = require('./common');

const DIR = path.join(config.rootDir, 'backups');
const bin = (name) => (config.pgBin ? path.join(config.pgBin, process.platform === 'win32' ? `${name}.exe` : name) : name);
const env = () => ({ ...process.env, PGPASSWORD: config.db.password });
const args = () => ['-h', config.db.host, '-p', String(config.db.port), '-U', config.db.user, '-d', config.db.database];

function run(cmd, params) {
  return new Promise((resolve, reject) => {
    execFile(bin(cmd), params, { env: env() }, (err, stdout, stderr) => {
      if (err) return reject(new AppError(`${cmd} завершился с ошибкой: ${(stderr || err.message).trim().slice(0, 300)}. Проверьте PG_BIN в .env`, 500));
      resolve(stdout);
    });
  });
}

async function create(userId = null, label = 'manual') {
  fs.mkdirSync(DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const file = `atlantis-${stamp}-${label}.dump`;
  await run('pg_dump', [...args(), '-F', 'c', '-f', path.join(DIR, file)]);
  await audit(userId, 'backup_create', null, null, { file });
  return file;
}

function list() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((f) => f.endsWith('.dump')).map((f) => {
    const st = fs.statSync(path.join(DIR, f));
    return { file: f, size: st.size, created: st.mtime };
  }).sort((a, b) => b.created - a.created);
}

const safe = (file) => {
  if (!/^atlantis-[\w-]+\.dump$/.test(file) || !fs.existsSync(path.join(DIR, file))) throw new AppError('Файл копии не найден', 404);
  return path.join(DIR, file);
};

async function restore(file, userId) {
  const full = safe(file);
  await create(userId, 'before-restore');   // страховочная копия перед восстановлением
  await run('pg_restore', [...args(), '--clean', '--if-exists', '--no-owner', full]);
  await audit(userId, 'backup_restore', null, null, { file });
}

// Хранить последние 14 автоматических копий
function prune() {
  list().filter((b) => b.file.endsWith('-auto.dump')).slice(14).forEach((b) => fs.unlinkSync(path.join(DIR, b.file)));
}

module.exports = { create, list, restore, prune, path: safe };
