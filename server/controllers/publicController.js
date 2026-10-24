// Публичная часть сайта: страницы, данные для клиентских скриптов, файлы, заявки
const db = require('../config/db');
const site = require('../services/siteService');
const rating = require('../services/ratingService');
const schedule = require('../services/scheduleService');
const enrollment = require('../services/enrollmentService');
const { AppError } = require('../utils/errors');
const v = require('../utils/validate');
const { encrypt } = require('../utils/crypto');
const { monthNav } = require('../utils/view');
const { notify } = require('../services/common');

const MONTHS_GEN = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

// Топ-10 месяца; в начале месяца, пока баллов нет, показывается прошлый месяц
async function topOfMonth(month) {
  const nav = monthNav(month);
  let top = await rating.ranking({ month: nav.start, publicOnly: true, limit: 10 });
  if (!month && !top.products.length) {
    const prev = monthNav(nav.prevMonth);
    const prevTop = await rating.ranking({ month: prev.start, publicOnly: true, limit: 10 });
    if (prevTop.products.length) return { nav: prev, top: prevTop };
  }
  return { nav, top };
}

async function home(req, res) {
  const { nav, top } = await topOfMonth();
  // На главной — три направления с наибольшим числом участников, по пять лучших; полный рейтинг на отдельной странице
  top.products = top.products.sort((a, b) => b.items.length - a.items.length).slice(0, 3).map((p) => ({ ...p, items: p.items.slice(0, 5) }));
  res.render('public/index', { top, monthTitle: `за ${MONTHS_GEN[nav.monthIndex]}` });
}

const page = (view) => (req, res) => res.render(`public/${view}`);

async function teachers(req, res) {
  res.render('public/pedagogi', { teachers: await site.teachers() });
}

async function teacher(req, res, next) {
  const t = await site.teacherBySlug(req.params.slug);
  if (!t) return next();
  res.render('public/pedagog', { t });
}

async function ratingPage(req, res) {
  const { nav, top } = await topOfMonth(req.query.month);
  res.render('public/reyting', { top, ...nav });
}

async function dataJs(req, res) {
  const bundle = await site.bundle();
  res.type('application/javascript').set('Cache-Control', 'no-store')
    .send(`/* Данные сайта формируются сервером из базы данных */\nwindow.ATLANTIS = ${JSON.stringify(bundle)};\n`);
}

// Файлы из БД: фото и картинки открыты всем, задания — вошедшим, справки — родителю ребёнка и сотрудникам
async function file(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return next();
  const f = await db.one('SELECT id, name, mime, data FROM files WHERE id = $1', [id]);
  if (!f) return next();
  const note = await db.one('SELECT c.parent_id FROM sick_notes s JOIN children c ON c.id = s.child_id WHERE s.file_id = $1', [id]);
  const hw = await db.one('SELECT 1 FROM homework WHERE file_id = $1', [id]);
  if ((note || hw) && !req.user) return res.redirect('/vhod?next=' + encodeURIComponent(req.originalUrl));
  if (note && req.user.role === 'PARENT' && note.parent_id !== req.user.id) throw new AppError('Нет доступа к файлу', 403);
  res.set('Content-Type', f.mime);
  res.set('Content-Disposition', `${f.mime === 'application/pdf' || f.mime.startsWith('image/') ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`);
  res.set('Cache-Control', note || hw ? 'private, no-store' : 'public, max-age=86400');
  res.send(f.data);
}

// Заявка на пробное занятие из формы на сайте
async function createRequest(req, res) {
  const b = req.body || {};
  if (!v.bool(b.consent)) throw new AppError('Нужно согласие на обработку персональных данных');
  const name = v.str(b.parentName, { name: 'Имя', required: true, min: 2, max: 160 });
  const phone = v.phone(b.phone);
  const age = v.str(b.childAge, { name: 'Возраст или класс ребёнка', max: 60 });
  const product = b.direction ? await db.one('SELECT id, title FROM products WHERE slug = $1', [String(b.direction)]) : null;
  const row = await db.one('INSERT INTO requests (parent_name, phone_enc, child_age, product_id) VALUES ($1,$2,$3,$4) RETURNING id',
    [name, encrypt(phone), age || null, product ? product.id : null]);
  const directors = await db.query(`SELECT id FROM users WHERE role = 'DIRECTOR' AND is_active`);
  for (const d of directors) await notify(d.id, `Новая заявка с сайта: ${name}${product ? `, «${product.title}»` : ''}.`);
  res.status(201).json({ id: row.id, message: 'Заявка отправлена' });
}

async function catalog(req, res) {
  res.json(await schedule.catalog());
}

// Недельное расписание: группа, учитель, кабинет, точка открыты всем; дети — только своим
async function week(req, res) {
  let { type, id, start } = req.query;
  const user = req.user;
  if (!type) {
    if (user && user.role === 'TEACHER') { type = 'teacher'; id = user.id; }
    else if (user && user.role === 'PARENT') type = 'parent';
    else { type = 'branch'; id = (await db.one('SELECT id FROM branches WHERE is_active ORDER BY name LIMIT 1') || {}).id; }
  }
  if (type === 'parent') {
    if (!user || user.role !== 'PARENT') throw new AppError('Войдите как родитель', 401);
    return res.json(await schedule.week({ type, start, parentId: user.id }));
  }
  if (type === 'child') {
    if (!user) throw new AppError('Войдите в систему', 401);
    if (user.role === 'PARENT' && !(await db.one('SELECT 1 FROM children WHERE id = $1 AND parent_id = $2', [id, user.id]))) throw new AppError('Нет доступа', 403);
  }
  const n = v.int(id, { name: 'Объект расписания', min: 1 });
  res.json(await schedule.week({ type, id: n, start }));
}

async function suggest(req, res) {
  res.json(await enrollment.suggest(req.query.age));
}

module.exports = { home, page, teachers, teacher, ratingPage, dataJs, file, createRequest, catalog, week, suggest };
