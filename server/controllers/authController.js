// Вход, регистрация, подтверждение почты, восстановление и смена пароля
const auth = require('../services/authService');
const { ROLE_HOME } = require('../middleware/auth');
const { AppError } = require('../utils/errors');

// Только внутренние адреса, чтобы ссылка ?next= не уводила на чужой сайт
const safeNext = (n) => (typeof n === 'string' && /^\/(?!\/)/.test(n) && !n.startsWith('/vhod') ? n : null);

// Новая сессия после входа защищает от фиксации идентификатора сессии
function signIn(req, userId) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = userId;
      req.session.save((e) => (e ? reject(e) : resolve()));
    });
  });
}

function loginPage(req, res) {
  if (req.user) return res.redirect(req.user.home);
  res.render('auth/vhod', { tab: req.query.tab === 'register' ? 'register' : 'login', next: safeNext(req.query.next) || '' });
}

async function login(req, res) {
  const { email, password, next } = req.body || {};
  try {
    const user = await auth.login(email, password);
    await signIn(req, user.id);
    const target = user.must_change_password ? '/parol' : (safeNext(next) || ROLE_HOME[user.role]);
    res.json({ redirect: target });
  } catch (err) {
    if (err.needVerify) return res.status(403).json({ error: err.message, needVerify: true });
    throw err;
  }
}

async function register(req, res) {
  const r = await auth.register(req.body || {});
  res.status(201).json({ email: r.email, message: r.mailEnabled ? 'Код отправлен на почту' : 'Код подтверждения выведен в консоль сервера (почта не настроена)' });
}

async function verify(req, res) {
  const { email, code } = req.body || {};
  const userId = await auth.verifyEmail(email, code);
  await signIn(req, userId);
  res.json({ message: 'Почта подтверждена', redirect: '/kabinet' });
}

async function resend(req, res) {
  await auth.resendCode((req.body || {}).email);
  res.json({ message: 'Если адрес зарегистрирован, код отправлен' });
}

async function forgot(req, res) {
  await auth.requestReset((req.body || {}).email);
  res.json({ message: 'Если адрес зарегистрирован, мы отправили код на почту' });
}

async function reset(req, res) {
  const { email, code, password } = req.body || {};
  await auth.resetPassword(email, code, password);
  res.json({ message: 'Пароль изменён, войдите с новым паролем', redirect: '/vhod' });
}

function passwordPage(req, res) {
  res.render('auth/parol');
}

async function changePassword(req, res) {
  if (!req.user) throw new AppError('Войдите в систему', 401);
  const { oldPassword, newPassword } = req.body || {};
  await auth.changePassword(req.user.id, oldPassword, newPassword);
  // Все сессии пользователя закрыты, текущую открываем заново
  await signIn(req, req.user.id);
  res.json({ message: 'Пароль изменён', redirect: ROLE_HOME[req.user.role] });
}

function logout(req, res) {
  req.session.destroy(() => {
    res.clearCookie('atlantis.sid');
    res.redirect('/');
  });
}

module.exports = { loginPage, login, register, verify, resend, forgot, reset, passwordPage, changePassword, logout };
