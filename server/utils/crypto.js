// Шифрование персональных данных в БД (AES-256-GCM) и генерация паролей и кодов
const crypto = require('crypto');
const config = require('../config');

function key() {
  if (!/^[0-9a-f]{64}$/i.test(config.encKey)) {
    throw new Error('ENC_KEY в .env должен содержать 64 шестнадцатеричных символа (запустите npm run setup)');
  }
  return Buffer.from(config.encKey, 'hex');
}

// Результат: iv.tag.данные в base64, всё в одной строке
function encrypt(text) {
  if (text === null || text === undefined || text === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

function decrypt(value) {
  if (!value) return '';
  try {
    const [iv, tag, data] = value.split('.').map((s) => Buffer.from(s, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

// Временный пароль: 10 символов без похожих букв (0/O, 1/l)
function tempPassword() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(10), (b) => abc[b % abc.length]).join('');
}

function code6() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

module.exports = { encrypt, decrypt, tempPassword, code6 };
