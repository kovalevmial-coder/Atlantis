// Настройка Express: безопасность, сессии, шаблоны, статика, маршруты, ошибки
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);
const config = require('./config');
const { pool } = require('./config/db');
const { loadUser } = require('./middleware/auth');
const { sameOrigin } = require('./middleware/security');
const { notFound, handler } = require('./middleware/errors');
const site = require('./services/siteService');
const { fmt } = require('./utils/view');
const routes = require('./routes');

function createApp({ secure = false } = {}) {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        formAction: ["'self'"],
        upgradeInsecureRequests: secure ? [] : null
      }
    },
    // при no-referrer (по умолчанию в helmet) браузер шлёт Origin: null у обычных форм,
    // и проверка источника отклоняла, например, кнопку «Выйти»
    referrerPolicy: { policy: 'same-origin' },
    hsts: secure
  }));

  // Статика сайта (стили, картинки, скрипты) и клиентские скрипты приложения
  const st = (dir) => express.static(path.join(config.siteDir, dir), { maxAge: config.isProd ? '1d' : 0 });
  app.use('/css', st('css'));
  app.use('/img', st('img'));
  app.use('/js', (req, res, next) => (req.path === '/data.js' ? next() : st('js')(req, res, next)));
  app.use('/app', express.static(path.join(__dirname, 'public'), { maxAge: config.isProd ? '1d' : 0 }));

  app.use(express.json({ limit: '200kb' }));
  app.use(express.urlencoded({ extended: false, limit: '200kb' }));

  app.use(session({
    store: new PgStore({ pool, tableName: 'session' }),
    name: 'atlantis.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, sameSite: 'lax', secure, maxAge: 1000 * 60 * 60 * 8 }
  }));
  app.use(sameOrigin);
  app.use(loadUser);

  // Общие данные для всех шаблонов
  app.use(async (req, res, next) => {
    try {
      const s = await site.settings();
      res.locals.center = { ...s, phoneHref: `tel:${(s.phone || '').replace(/[^\d+]/g, '')}` };
      res.locals.fmt = fmt;
      res.locals.flash = req.session.flash || null;
      if (req.session.flash) delete req.session.flash;
      next();
    } catch (err) { next(err); }
  });

  app.use(routes);
  app.use(notFound);
  app.use(handler);
  return app;
}

module.exports = { createApp };
