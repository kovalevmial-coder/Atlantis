// Панель директора: ученики, учителя, группы, заявки, пользователи, конструктор, настройки, резервные копии
const db = require('../config/db');
const crud = require('../models/crud');
const auth = require('../services/authService');
const finance = require('../services/financeService');
const load = require('../services/loadService');
const backup = require('../services/backupService');
const { ageOf, promoteWaiting } = require('../services/enrollmentService');
const { audit, saveFile } = require('../services/common');
const { branchScope, ROLE_TITLE } = require('../middleware/auth');
const { AppError } = require('../utils/errors');
const { encrypt, decrypt } = require('../utils/crypto');
const v = require('../utils/validate');
const dates = require('../utils/dates');
const { fmt } = require('../utils/view');
const mailer = require('../utils/mailer');

const id = (req) => v.int(req.params.id, { name: 'Номер записи', min: 1 });
// Если почта не настроена, временный пароль показывается директору на экране
const tempText = (mailed, temp) => (mailed ? 'Временный пароль отправлен на почту.' : `Почта не настроена, передайте временный пароль лично: ${temp}`);

// ---------- Главная ----------
async function home(req, res) {
  const b = branchScope(req.user);
  const today = dates.today();
  const [children, groupLoad, requests, paid, notes, debtors, unmarked, auditRows] = await Promise.all([
    db.one(`SELECT count(DISTINCT c.id) AS n FROM children c JOIN enrollments e ON e.child_id = c.id AND e.status IN ('active','trial') JOIN groups g ON g.id = e.group_id
             WHERE c.is_active AND ($1::int IS NULL OR g.branch_id = $1)`, [b]),
    load.groupLoad({ branchId: b }),
    db.one(`SELECT count(*) AS n FROM requests WHERE status = 'new'`),
    db.one(`SELECT COALESCE(sum(amount), 0) AS s FROM payments WHERE paid_at BETWEEN $1 AND $2 AND ($3::int IS NULL OR branch_id = $3)`, [dates.monthStart(today), dates.monthEnd(today), b]),
    db.one(`SELECT count(*) AS n FROM sick_notes WHERE status = 'pending'`),
    finance.debtors(b),
    db.one(`SELECT count(*) AS n FROM lessons l JOIN groups g ON g.id = l.group_id WHERE l.status = 'planned' AND l.lesson_date < $1 AND l.lesson_date >= $1::date - 60
             AND ($2::int IS NULL OR g.branch_id = $2)`, [today, b]),
    db.query(`SELECT a.action, a.entity, a.created_at, u.full_name AS who FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 12`)
  ]);
  const groups = groupLoad.groups;
  const stats = {
    children: children.n, groups: groups.length,
    avgLoad: groups.length ? Math.round(groups.reduce((s, g) => s + g.plan, 0) / groups.length) : 0,
    newRequests: requests.n, monthPaid: paid.s, pendingNotes: notes.n,
    debtors: debtors.length, debtSum: Math.abs(debtors.reduce((s, d) => s + d.balance, 0)), unmarked: unmarked.n,
    overloaded: groups.filter((g) => g.level === 'high').length, underloaded: groups.filter((g) => g.level === 'low').length
  };
  res.render('admin/home', { stats, audit: auditRows.map((a) => ({ who: a.who, at: fmt.dateTime(a.created_at), action: ACTIONS[a.action] || a.action })) });
}

const ACTIONS = {
  login: 'вход в систему', login_locked: 'блокировка входа', register: 'регистрация', password_change: 'смена пароля', password_reset: 'сброс пароля',
  user_create: 'создание пользователя', user_active: 'блокировка/разблокировка пользователя', slot_save: 'изменение расписания', slot_delete: 'удаление времени из расписания',
  lesson_cancel: 'отмена занятия', lesson_move: 'перенос занятия', journal_save: 'заполнение журнала', sick_note_upload: 'загрузка справки',
  sick_note_accept: 'справка принята', sick_note_reject: 'справка отклонена', payment_add: 'приём оплаты', payment_delete: 'удаление оплаты',
  debt_remind: 'напоминание должникам', enroll: 'запись в группу', enroll_finish: 'отчисление из группы', enroll_status: 'смена статуса записи',
  backup_create: 'резервная копия', backup_restore: 'восстановление из копии', child_save: 'изменение ученика', group_save: 'изменение группы',
  teacher_save: 'изменение учителя', request_update: 'обработка заявки', settings_save: 'изменение настроек', entity_save: 'изменение в конструкторе',
  entity_delete: 'удаление в конструкторе'
};

// ---------- Ученики ----------
async function ucheniki(req, res) {
  const q = String(req.query.q || '').trim();
  const rows = await db.query(
    `SELECT c.id, c.full_name, c.grade, c.is_active, c.birth_date_enc, u.full_name AS parent, u.phone_enc, bf.title AS benefit,
            (SELECT string_agg(g.title, ', ') FROM enrollments e JOIN groups g ON g.id = e.group_id WHERE e.child_id = c.id AND e.status <> 'finished') AS groups,
            COALESCE((SELECT sum(amount) FROM payments WHERE child_id = c.id), 0) - COALESCE((SELECT sum(amount) FROM charges WHERE child_id = c.id), 0) AS balance
       FROM children c LEFT JOIN users u ON u.id = c.parent_id LEFT JOIN benefits bf ON bf.id = c.benefit_id
      WHERE ($1 = '' OR c.full_name ILIKE '%' || $1 || '%' OR u.full_name ILIKE '%' || $1 || '%')
      ORDER BY c.is_active DESC, c.full_name`, [q]);
  const list = rows.map((c) => ({ ...c, age: ageOf(decrypt(c.birth_date_enc)), parent_phone: decrypt(c.phone_enc) }));
  res.render('admin/ucheniki', { list, q });
}

async function uchenikForm(req, res) {
  let c = null; let enrollments = []; let bal = null;
  if (req.params.id) {
    c = await db.one('SELECT * FROM children WHERE id = $1', [id(req)]);
    if (!c) throw new AppError('Ученик не найден', 404);
    c.birth_date = decrypt(c.birth_date_enc);
    enrollments = await db.query(`SELECT e.id, e.group_id, e.status, g.title FROM enrollments e JOIN groups g ON g.id = e.group_id WHERE e.child_id = $1 ORDER BY e.created_at DESC`, [c.id]);
    bal = await finance.balance(c.id);
  }
  const [benefits, parents, groups] = await Promise.all([
    db.query('SELECT id, title, discount_pct FROM benefits WHERE is_active ORDER BY title'),
    db.query(`SELECT id, full_name, email FROM users WHERE role = 'PARENT' AND is_active ORDER BY full_name`),
    db.query(`SELECT g.id, g.title, g.capacity, (SELECT count(*) FROM enrollments e WHERE e.group_id = g.id AND e.status IN ('active','trial')) AS taken
                FROM groups g WHERE g.is_active AND ($1::int IS NULL OR g.branch_id = $1) ORDER BY g.title`, [branchScope(req.user)])
  ]);
  res.render('admin/uchenik-form', { c, benefits, parents, enrollments, groups, bal });
}

async function saveChild(req, res) {
  const b = req.body || {};
  const childId = req.params.id ? id(req) : null;
  const data = {
    fullName: v.str(b.fullName, { name: 'ФИО ребёнка', required: true, min: 3, max: 160 }),
    birthDate: v.date(b.birthDate, { name: 'Дата рождения', required: false }),
    grade: v.str(b.grade, { name: 'Класс', max: 30 }) || null,
    benefitId: b.benefitId ? v.int(b.benefitId, { name: 'Льгота' }) : null,
    note: v.str(b.note, { name: 'Примечание', max: 500 }) || null,
    consent: v.bool(b.ratingConsent),
    isActive: childId ? v.bool(b.isActive) : true
  };
  if (data.birthDate && (data.birthDate > dates.today() || ageOf(data.birthDate) > 18)) throw new AppError('Проверьте дату рождения');
  let message = 'Ученик сохранён.';
  const newId = await db.tx(async (q) => {
    let parentId = b.parentId ? v.int(b.parentId, { name: 'Родитель' }) : null;
    if (!parentId && (b.parentEmail || b.parentName)) {
      const email = v.email(b.parentEmail);
      const exists = await q.one('SELECT id, role FROM users WHERE lower(email) = $1', [email]);
      if (exists) {
        if (exists.role !== 'PARENT') throw new AppError('Эта почта принадлежит сотруднику');
        parentId = exists.id;
      } else {
        const fullName = v.str(b.parentName, { name: 'ФИО родителя', required: true, min: 3, max: 160 });
        const phone = v.phone(b.parentPhone, false);
        const created = await auth.createWithTempPassword({ email, fullName, phone, role: 'PARENT' }, req.user.id, q);
        parentId = created.id;
        const mailed = await auth.sendTempPassword(email, fullName, created.temp);
        message += ` Кабинет родителя создан. ${tempText(mailed, created.temp)}`;
      }
    }
    const params = [data.fullName, encrypt(data.birthDate), data.grade, data.benefitId, data.note, data.consent, parentId];
    let row;
    if (childId) {
      row = await q.one(`UPDATE children SET full_name=$1, birth_date_enc=$2, grade=$3, benefit_id=$4, note=$5, rating_consent=$6, parent_id=$7, is_active=$8
                          WHERE id=$9 RETURNING id`, [...params, data.isActive, childId]);
      if (!row) throw new AppError('Ученик не найден', 404);
    } else {
      row = await q.one(`INSERT INTO children (full_name, birth_date_enc, grade, benefit_id, note, rating_consent, parent_id)
                         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, params);
    }
    await audit(req.user.id, 'child_save', 'children', row.id, null, q);
    return row.id;
  });
  res.json({ message, redirect: childId ? undefined : `/direktor/ucheniki/${newId}` });
}

// ---------- Учителя ----------
async function uchitelya(req, res) {
  const list = await db.query(
    `SELECT u.id, u.full_name, u.email, u.role, u.is_active, tp.position, tp.slug, tp.show_on_site,
            (SELECT string_agg(b.name, ', ') FROM teacher_branches tb JOIN branches b ON b.id = tb.branch_id WHERE tb.user_id = u.id) AS branches,
            (SELECT count(*) FROM groups g WHERE g.teacher_id = u.id AND g.is_active) AS groups
       FROM users u LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
      WHERE u.role = 'TEACHER' OR (u.role = 'DIRECTOR' AND tp.user_id IS NOT NULL)
      ORDER BY u.is_active DESC, u.full_name`);
  res.render('admin/uchitelya', { list });
}

async function uchitelForm(req, res) {
  let t = null;
  if (req.params.id) {
    t = await db.one(
      `SELECT u.id, u.full_name, u.email, u.phone_enc, u.is_active, u.role, tp.*,
              COALESCE((SELECT array_agg(branch_id) FROM teacher_branches WHERE user_id = u.id), '{}') AS branch_ids
         FROM users u LEFT JOIN teacher_profiles tp ON tp.user_id = u.id WHERE u.id = $1 AND u.role IN ('TEACHER','DIRECTOR')`, [id(req)]);
    if (!t) throw new AppError('Учитель не найден', 404);
    t.id = Number(req.params.id);
    t.phone = decrypt(t.phone_enc);
  }
  res.render('admin/uchitel-form', { t, branches: await db.query('SELECT id, name FROM branches ORDER BY name') });
}

const translit = (s) => {
  const map = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya' };
  return String(s).toLowerCase().split('').map((c) => (map[c] !== undefined ? map[c] : c)).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
};

async function saveTeacher(req, res) {
  const b = req.body || {};
  const teacherIdParam = req.params.id ? id(req) : null;
  const fullName = v.str(b.fullName, { name: 'ФИО', required: true, min: 3, max: 160 });
  const phone = v.phone(b.phone, false);
  const branchIds = [].concat(b.branches || []).map(Number).filter(Number.isInteger);
  let slug = v.str(b.slug, { name: 'Адрес страницы', max: 60 }).toLowerCase() || translit(fullName.split(' ').slice(0, 2).join(' '));
  if (!/^[a-z0-9-]+$/.test(slug)) throw new AppError('Адрес страницы: только латиница, цифры и дефис');
  const profile = [
    slug, v.str(b.position, { name: 'Должность', max: 120 }) || null, v.str(b.lead, { name: 'Коротко о себе', max: 400 }) || null,
    v.str(b.education, { name: 'Образование' }) || null, v.int(b.experienceYears, { name: 'Стаж', min: 0, max: 70, required: false }),
    v.lines(b.achievements), v.str(b.motto, { name: 'Девиз' }) || null, v.bool(b.showOnSite), v.int(b.sort || 0, { name: 'Порядок' })
  ];
  let message = 'Сохранено.';
  const userId = await db.tx(async (q) => {
    let uid = teacherIdParam;
    if (uid) {
      const row = await q.one(`UPDATE users SET full_name=$2, phone_enc=$3, is_active=$4 WHERE id=$1 AND role IN ('TEACHER','DIRECTOR') RETURNING id, role`,
        [uid, fullName, encrypt(phone), uid === req.user.id ? true : v.bool(b.is_active)]);
      if (!row) throw new AppError('Учитель не найден', 404);
    } else {
      const created = await auth.createWithTempPassword({ email: b.email, fullName, phone, role: 'TEACHER' }, req.user.id, q);
      uid = created.id;
      const mailed = await auth.sendTempPassword(v.email(b.email), fullName, created.temp);
      message = `Учётная запись создана. ${tempText(mailed, created.temp)}`;
    }
    const photoId = req.file ? await saveFile(req.file, q) : null;
    await q.query(
      `INSERT INTO teacher_profiles (user_id, slug, position, lead, education, experience_years, achievements, motto, show_on_site, sort, photo_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (user_id) DO UPDATE SET slug=EXCLUDED.slug, position=EXCLUDED.position, lead=EXCLUDED.lead, education=EXCLUDED.education,
         experience_years=EXCLUDED.experience_years, achievements=EXCLUDED.achievements, motto=EXCLUDED.motto, show_on_site=EXCLUDED.show_on_site,
         sort=EXCLUDED.sort, photo_id=COALESCE(EXCLUDED.photo_id, teacher_profiles.photo_id)`, [uid, ...profile, photoId]);
    await q.query('DELETE FROM teacher_branches WHERE user_id = $1', [uid]);
    for (const bid of branchIds) await q.query('INSERT INTO teacher_branches (user_id, branch_id) VALUES ($1,$2)', [uid, bid]);
    await audit(req.user.id, 'teacher_save', 'users', uid, null, q);
    return uid;
  });
  res.json({ message, redirect: teacherIdParam ? undefined : `/direktor/uchitelya/${userId}` });
}

// ---------- Группы ----------
async function gruppaForm(req, res) {
  let g = null;
  if (req.params.id) {
    g = await db.one(`SELECT *, to_char(start_date,'YYYY-MM-DD') AS start_date, to_char(end_date,'YYYY-MM-DD') AS end_date FROM groups WHERE id = $1`, [id(req)]);
    if (!g) throw new AppError('Группа не найдена', 404);
  }
  const today = dates.today();
  const y = Number(today.slice(5, 7)) >= 8 ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
  const [products, branches, teachers] = await Promise.all([
    db.query('SELECT id, title, price FROM products WHERE is_active ORDER BY sort, title'),
    db.query('SELECT id, name FROM branches WHERE is_active AND ($1::int IS NULL OR id = $1) ORDER BY name', [branchScope(req.user)]),
    db.query(`SELECT id, full_name FROM users WHERE role IN ('TEACHER','DIRECTOR') AND is_active ORDER BY full_name`)
  ]);
  res.render('admin/gruppa-form', { g, products, branches, teachers, defaults: { start: today, end: `${y + 1}-05-31` } });
}

async function saveGroup(req, res) {
  const b = req.body || {};
  const gid = req.params.id ? id(req) : null;
  const data = [
    v.str(b.title, { name: 'Название', required: true, min: 3, max: 120 }),
    v.int(b.productId, { name: 'Продукт' }), v.int(b.branchId, { name: 'Точка' }), v.int(b.teacherId, { name: 'Учитель' }),
    v.int(b.capacity, { name: 'Вместимость', min: 1, max: 100 }), v.num(b.price, { name: 'Цена', min: 0, required: false }),
    v.date(b.startDate, { name: 'Начало' }), v.date(b.endDate, { name: 'Конец' })
  ];
  if (data[6] > data[7]) throw new AppError('Дата начала должна быть раньше даты окончания');
  if (req.user.branch_id && data[2] !== req.user.branch_id) throw new AppError('Можно создавать группы только своей точки', 403);
  const teacher = await db.one(`SELECT id FROM users WHERE id = $1 AND role IN ('TEACHER','DIRECTOR')`, [data[3]]);
  if (!teacher) throw new AppError('Учитель не найден');
  const result = await db.tx(async (q) => {
    let row;
    if (gid) {
      row = await q.one(`UPDATE groups SET title=$1, product_id=$2, branch_id=$3, teacher_id=$4, capacity=$5, price=$6, start_date=$7, end_date=$8, is_active=$9
                          WHERE id=$10 RETURNING id`, [...data, v.bool(b.isActive), gid]);
      if (!row) throw new AppError('Группа не найдена', 404);
      // Новый учитель переходит и в будущие занятия
      await q.query(`UPDATE lessons SET teacher_id = $2 WHERE group_id = $1 AND lesson_date >= CURRENT_DATE AND status = 'planned'`, [gid, data[3]]);
    } else {
      row = await q.one(`INSERT INTO groups (title, product_id, branch_id, teacher_id, capacity, price, start_date, end_date)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, data);
    }
    const promoted = gid ? await promoteWaiting(row.id, q) : [];
    await audit(req.user.id, 'group_save', 'groups', row.id, null, q);
    return { id: row.id, promoted };
  });
  const extra = result.promoted.length ? ` Из листа ожидания переведены: ${result.promoted.join(', ')}.` : '';
  res.json({ message: 'Группа сохранена.' + extra, redirect: `/direktor/gruppy/${result.id}` });
}

// ---------- Заявки ----------
async function zayavki(req, res) {
  const rows = await db.query(
    `SELECT r.*, p.title AS product FROM requests r LEFT JOIN products p ON p.id = r.product_id
      ORDER BY (r.status = 'new') DESC, r.created_at DESC LIMIT 200`);
  res.render('admin/zayavki', { list: rows.map((r) => ({ ...r, phone: decrypt(r.phone_enc), created: fmt.dateTime(r.created_at) })) });
}

async function updateRequest(req, res) {
  const b = req.body || {};
  const status = v.oneOf(b.status, ['new', 'in_work', 'done', 'rejected'], 'Статус');
  const row = await db.one('UPDATE requests SET status=$2, comment=$3, processed_by=$4 WHERE id=$1 RETURNING id',
    [id(req), status, v.str(b.comment, { name: 'Комментарий', max: 255 }) || null, req.user.id]);
  if (!row) throw new AppError('Заявка не найдена', 404);
  await audit(req.user.id, 'request_update', 'requests', row.id, { status });
  res.json({ message: 'Заявка обновлена' });
}

// ---------- Пользователи ----------
async function polzovateli(req, res) {
  const list = await db.query(
    `SELECT u.id, u.full_name, u.email, u.role, u.is_active, u.email_verified, b.name AS branch, u.last_login_at,
            (u.locked_until IS NOT NULL AND u.locked_until > now()) AS locked
       FROM users u LEFT JOIN branches b ON b.id = u.branch_id
      ORDER BY CASE u.role WHEN 'DIRECTOR' THEN 1 WHEN 'TEACHER' THEN 2 ELSE 3 END, u.full_name`);
  res.render('admin/polzovateli', {
    list: list.map((u) => ({ ...u, last_login: u.last_login_at ? fmt.dateTime(u.last_login_at) : null })),
    roles: ROLE_TITLE, branches: await db.query('SELECT id, name FROM branches ORDER BY name')
  });
}

async function resetUser(req, res) {
  if (id(req) === req.user.id) throw new AppError('Свой пароль меняется в профиле');
  const r = await auth.resetToTemp(id(req), req.user.id);
  res.json({ message: `Пароль сброшен. ${tempText(r.mailed, r.temp)}` });
}

async function setActive(req, res) {
  if (id(req) === req.user.id) throw new AppError('Нельзя заблокировать самого себя');
  const active = v.bool((req.body || {}).active);
  await db.query('UPDATE users SET is_active = $2 WHERE id = $1', [id(req), active]);
  if (!active) await db.query(`DELETE FROM session WHERE (sess->>'userId')::int = $1`, [id(req)]);
  await audit(req.user.id, 'user_active', 'users', id(req), { active });
  res.json({ message: active ? 'Пользователь разблокирован' : 'Пользователь заблокирован' });
}

async function createDirector(req, res) {
  if (req.user.branch_id) throw new AppError('Добавлять директоров может только главный директор', 403);
  const b = req.body || {};
  const fullName = v.str(b.fullName, { name: 'ФИО', required: true, min: 3, max: 160 });
  const email = v.email(b.email);
  const r = await auth.createWithTempPassword({ email, fullName, phone: v.phone(b.phone, false), role: 'DIRECTOR', branchId: b.branchId ? Number(b.branchId) : null }, req.user.id);
  const mailed = await auth.sendTempPassword(email, fullName, r.temp);
  res.status(201).json({ message: `Директор создан. ${tempText(mailed, r.temp)}` });
}

// ---------- Конструктор ----------
async function konstruktor(req, res) {
  const counts = {};
  for (const k of Object.keys(crud.ENTITIES)) counts[k] = (await db.one(`SELECT count(*) AS n FROM ${crud.ENTITIES[k].table}`)).n;
  res.render('admin/konstruktor', { entities: crud.ENTITIES, counts });
}

async function entityList(req, res) {
  const e = crud.entity(req.params.entity);
  res.render('admin/entity-list', { e, name: req.params.entity, rows: await crud.list(req.params.entity), refs: await crud.refs(e) });
}

async function entityForm(req, res) {
  const e = crud.entity(req.params.entity);
  const row = req.params.id ? await crud.get(req.params.entity, req.params.id) : null;
  res.render('admin/entity-form', { e, name: req.params.entity, row, refs: await crud.refs(e) });
}

async function entitySave(req, res, next) {
  if (!crud.ENTITIES[req.params.entity]) return next();
  const rid = await crud.save(req.params.entity, req.params.id || null, req.body || {}, req.file);
  await audit(req.user.id, 'entity_save', req.params.entity, Number(rid) || null);
  res.json({ message: 'Сохранено', redirect: `/direktor/konstruktor/${req.params.entity}` });
}

async function entityDelete(req, res, next) {
  if (!crud.ENTITIES[req.params.entity]) return next();
  await crud.remove(req.params.entity, req.params.id);
  await audit(req.user.id, 'entity_delete', req.params.entity, Number(req.params.id) || null);
  res.json({ message: 'Удалено' });
}

// ---------- Настройки сайта ----------
async function nastroiki(req, res) {
  res.render('admin/nastroiki', { list: await db.query('SELECT key, title, value FROM settings ORDER BY title') });
}

async function saveSettings(req, res) {
  const b = req.body || {};
  const keys = (await db.query('SELECT key FROM settings')).map((r) => r.key);
  for (const k of keys) if (b[k] !== undefined) await db.query('UPDATE settings SET value = $2 WHERE key = $1', [k, v.str(b[k], { name: k, max: 500 })]);
  await audit(req.user.id, 'settings_save', 'settings', null);
  res.json({ message: 'Настройки сохранены' });
}

// ---------- Резервные копии ----------
function kopii(req, res) {
  res.render('admin/kopii', { list: backup.list().map((b) => ({ ...b, createdText: fmt.dateTime(b.created) })) });
}

async function createBackup(req, res) {
  const file = await backup.create(req.user.id);
  res.json({ message: `Копия создана: ${file}` });
}

async function restoreBackup(req, res) {
  await backup.restore(req.params.file, req.user.id);
  res.json({ message: 'База восстановлена из копии' });
}

function downloadBackup(req, res) {
  res.download(backup.path(req.params.file));
}

module.exports = {
  home, ucheniki, uchenikForm, saveChild, uchitelya, uchitelForm, saveTeacher, gruppaForm, saveGroup,
  zayavki, updateRequest, polzovateli, resetUser, setActive, createDirector,
  konstruktor, entityList, entityForm, entitySave, entityDelete, nastroiki, saveSettings,
  kopii, createBackup, restoreBackup, downloadBackup, mailEnabled: mailer.enabled
};
