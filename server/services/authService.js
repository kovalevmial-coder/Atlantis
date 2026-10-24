// Бизнес-операция 1: регистрация с подтверждением e-mail, вход с блокировкой, временные пароли
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { AppError } = require('../utils/errors');
const v = require('../utils/validate');
const { encrypt, tempPassword, code6 } = require('../utils/crypto');
const mailer = require('../utils/mailer');
const { audit } = require('./common');

const MAX_FAILS = 5;
const LOCK_MIN = 15;

const hash = (p) => bcrypt.hash(p, 12);

async function sendCode(userId, email, purpose) {
  const code = code6();
  await db.query('UPDATE email_codes SET used = TRUE WHERE user_id = $1 AND purpose = $2 AND NOT used', [userId, purpose]);
  await db.query(`INSERT INTO email_codes (user_id, purpose, code_hash, expires_at) VALUES ($1,$2,$3, now() + interval '30 minutes')`,
    [userId, purpose, await bcrypt.hash(code, 8)]);
  const subject = purpose === 'verify' ? 'Код подтверждения регистрации' : 'Код для восстановления пароля';
  await mailer.send(email, `Атлантис: ${subject.toLowerCase()}`, `${subject}: ${code}\nКод действует 30 минут. Если вы не запрашивали код, просто проигнорируйте письмо.`);
}

async function checkCode(userId, purpose, code) {
  const rows = await db.query(
    `SELECT id, code_hash FROM email_codes WHERE user_id = $1 AND purpose = $2 AND NOT used AND expires_at > now() ORDER BY id DESC LIMIT 1`,
    [userId, purpose]);
  if (!rows.length || !(await bcrypt.compare(String(code || '').trim(), rows[0].code_hash))) {
    throw new AppError('Неверный или просроченный код');
  }
  await db.query('UPDATE email_codes SET used = TRUE WHERE id = $1', [rows[0].id]);
}

// Самостоятельная регистрация родителя (UC-4)
async function register(data) {
  const fullName = v.str(data.fullName, { name: 'Имя и фамилия', required: true, min: 2, max: 160 });
  const email = v.email(data.email);
  const phone = v.phone(data.phone);
  const password = v.password(data.password);
  if (!v.bool(data.consent)) throw new AppError('Нужно согласие на обработку персональных данных');
  const exists = await db.one('SELECT id, email_verified FROM users WHERE lower(email) = $1', [email]);
  if (exists && exists.email_verified) throw new AppError('Пользователь с такой почтой уже зарегистрирован', 409);
  let userId;
  if (exists) {
    // Регистрация не была подтверждена: обновляем данные и шлём новый код
    await db.query('UPDATE users SET full_name=$2, phone_enc=$3, password_hash=$4 WHERE id=$1',
      [exists.id, fullName, encrypt(phone), await hash(password)]);
    userId = exists.id;
  } else {
    const row = await db.one(
      `INSERT INTO users (email, password_hash, role, full_name, phone_enc) VALUES ($1,$2,'PARENT',$3,$4) RETURNING id`,
      [email, await hash(password), fullName, encrypt(phone)]);
    userId = row.id;
  }
  await sendCode(userId, email, 'verify');
  await audit(userId, 'register', 'users', userId);
  return { userId, email, mailEnabled: mailer.enabled() };
}

async function verifyEmail(email, code) {
  const user = await db.one('SELECT id FROM users WHERE lower(email) = $1', [v.email(email)]);
  if (!user) throw new AppError('Пользователь не найден', 404);
  await checkCode(user.id, 'verify', code);
  await db.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [user.id]);
  return user.id;
}

async function resendCode(email) {
  const user = await db.one('SELECT id, email FROM users WHERE lower(email) = $1 AND NOT email_verified', [v.email(email)]);
  if (user) await sendCode(user.id, user.email, 'verify');
}

// Вход (UC-5): после 5 неудачных попыток вход блокируется на 15 минут
async function login(emailRaw, password) {
  const email = v.email(emailRaw);
  const user = await db.one('SELECT * FROM users WHERE lower(email) = $1', [email]);
  const fail = new AppError('Неверный адрес почты или пароль', 401);
  if (!user || !user.is_active) throw fail;
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const min = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
    throw new AppError(`Слишком много неудачных попыток. Вход заблокирован ещё на ${min} мин.`, 429);
  }
  if (!(await bcrypt.compare(String(password || ''), user.password_hash))) {
    const fails = user.failed_logins + 1;
    await db.query(`UPDATE users SET failed_logins = $2, locked_until = CASE WHEN $3 THEN now() + interval '${LOCK_MIN} minutes' ELSE NULL END WHERE id = $1`,
      [user.id, fails >= MAX_FAILS ? 0 : fails, fails >= MAX_FAILS]);
    if (fails >= MAX_FAILS) {
      await audit(user.id, 'login_locked', 'users', user.id);
      throw new AppError(`Вход заблокирован на ${LOCK_MIN} минут после ${MAX_FAILS} неудачных попыток`, 429);
    }
    throw fail;
  }
  if (!user.email_verified) {
    await sendCode(user.id, user.email, 'verify');
    const err = new AppError('Подтвердите почту: мы отправили новый код', 403);
    err.needVerify = true;
    throw err;
  }
  await db.query('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [user.id]);
  await audit(user.id, 'login', 'users', user.id);
  return user;
}

async function changePassword(userId, oldPassword, newPassword, { skipOld = false } = {}) {
  const user = await db.one('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (!skipOld && !(await bcrypt.compare(String(oldPassword || ''), user.password_hash))) throw new AppError('Текущий пароль указан неверно');
  const pass = v.password(newPassword);
  if (await bcrypt.compare(pass, user.password_hash)) throw new AppError('Новый пароль должен отличаться от старого');
  await db.query('UPDATE users SET password_hash = $2, must_change_password = FALSE WHERE id = $1', [userId, await hash(pass)]);
  // Выход со всех других устройств
  await db.query(`DELETE FROM session WHERE (sess->>'userId')::int = $1`, [userId]);
  await audit(userId, 'password_change', 'users', userId);
}

async function requestReset(emailRaw) {
  const user = await db.one('SELECT id, email FROM users WHERE lower(email) = $1 AND is_active', [v.email(emailRaw)]);
  if (user) await sendCode(user.id, user.email, 'reset'); // ответ одинаковый, чтобы не раскрывать, есть ли такой адрес
}

async function resetPassword(emailRaw, code, newPassword) {
  const user = await db.one('SELECT id FROM users WHERE lower(email) = $1', [v.email(emailRaw)]);
  if (!user) throw new AppError('Неверный или просроченный код');
  await checkCode(user.id, 'reset', code);
  await db.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [user.id]);
  await changePassword(user.id, null, newPassword, { skipOld: true });
}

// Учётная запись, созданная директором: временный пароль, обязательная смена при первом входе
async function createWithTempPassword({ email, fullName, phone, role, branchId = null }, actorId, q = db) {
  const temp = tempPassword();
  const row = await q.one(
    `INSERT INTO users (email, password_hash, role, full_name, phone_enc, branch_id, email_verified, must_change_password)
     VALUES ($1,$2,$3,$4,$5,$6,TRUE,TRUE) RETURNING id`,
    [v.email(email), await hash(temp), role, fullName, encrypt(phone), branchId]);
  await audit(actorId, 'user_create', 'users', row.id, { role }, q);
  return { id: row.id, temp };
}

async function sendTempPassword(email, fullName, temp) {
  const res = await mailer.send(email, 'Атлантис: доступ в личный кабинет',
    `Здравствуйте, ${fullName}!\n\nДля вас создан личный кабинет центра «Атлантис».\nЛогин: ${email}\nВременный пароль: ${temp}\n\nПри первом входе система попросит сменить пароль.`);
  return !res.console;
}

async function resetToTemp(userId, actorId) {
  const temp = tempPassword();
  const user = await db.one('UPDATE users SET password_hash=$2, must_change_password=TRUE, failed_logins=0, locked_until=NULL WHERE id=$1 RETURNING email, full_name',
    [userId, await hash(temp)]);
  if (!user) throw new AppError('Пользователь не найден', 404);
  await db.query(`DELETE FROM session WHERE (sess->>'userId')::int = $1`, [userId]);
  await audit(actorId, 'password_reset', 'users', userId);
  const mailed = await sendTempPassword(user.email, user.full_name, temp);
  return { temp, mailed };
}

module.exports = { register, verifyEmail, resendCode, login, changePassword, requestReset, resetPassword, createWithTempPassword, sendTempPassword, resetToTemp, hash };
