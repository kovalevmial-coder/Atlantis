// Аутентификация и проверка ролей
const { one } = require('../config/db');

const ROLE_HOME = { PARENT: '/kabinet', TEACHER: '/uchitel', DIRECTOR: '/direktor' };
const ROLE_TITLE = { PARENT: 'Родитель', TEACHER: 'Учитель', DIRECTOR: 'Директор' };

// Загружает текущего пользователя из сессии в req.user и res.locals.user
async function loadUser(req, res, next) {
  res.locals.user = null;
  if (!req.session || !req.session.userId) return next();
  try {
    const user = await one(
      `SELECT u.id, u.email, u.role, u.full_name, u.branch_id, u.must_change_password, u.is_active,
              b.name AS branch_name,
              (SELECT count(*) FROM notifications n WHERE n.user_id = u.id AND NOT n.is_read) AS unread
         FROM users u LEFT JOIN branches b ON b.id = u.branch_id
        WHERE u.id = $1`, [req.session.userId]);
    if (!user || !user.is_active) {
      req.session.destroy(() => {});
      return next();
    }
    user.home = ROLE_HOME[user.role];
    user.roleTitle = ROLE_TITLE[user.role];
    req.user = user;
    res.locals.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

const wantsJson = (req) => req.originalUrl.startsWith('/api/');

function requireAuth(req, res, next) {
  if (!req.user) {
    if (wantsJson(req)) return res.status(401).json({ error: 'Войдите в систему' });
    return res.redirect('/vhod?next=' + encodeURIComponent(req.originalUrl));
  }
  // Временный пароль нужно сменить до любой другой работы
  if (req.user.must_change_password && !req.originalUrl.startsWith('/parol') && !req.originalUrl.startsWith('/api/auth')) {
    if (wantsJson(req)) return res.status(403).json({ error: 'Смените временный пароль' });
    return res.redirect('/parol');
  }
  next();
}

// requireRole('TEACHER', 'DIRECTOR')
function requireRole(...roles) {
  return [requireAuth, (req, res, next) => {
    if (roles.includes(req.user.role)) return next();
    if (wantsJson(req)) return res.status(403).json({ error: 'Недостаточно прав' });
    res.status(403).render('public/error', { title: 'Нет доступа', message: 'У вашей роли нет доступа к этой странице.', page: 'error' });
  }];
}

// Точка, которой ограничен директор (NULL — все точки)
const branchScope = (user) => (user && user.role === 'DIRECTOR' ? user.branch_id : null);

module.exports = { loadUser, requireAuth, requireRole, branchScope, ROLE_HOME, ROLE_TITLE };
