// Запись детей в группы: подбор по возрасту, вместимость, лист ожидания
const db = require('../config/db');
const { AppError } = require('../utils/errors');
const v = require('../utils/validate');
const dates = require('../utils/dates');
const { decrypt } = require('../utils/crypto');
const { audit, notify } = require('./common');

const ageOf = (birthDate, at = dates.today()) => {
  if (!birthDate) return null;
  const b = dates.parse(birthDate); const t = dates.parse(at);
  let age = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age -= 1;
  return age;
};

// Бизнес-операция 2: подбор продуктов и групп по возрасту ребёнка
async function suggest(age) {
  const a = v.int(age, { name: 'Возраст', min: 1, max: 18 });
  return db.query(
    `SELECT p.id, p.title, p.slug, p.age_label, g.id AS group_id, g.title AS group_title, b.name AS branch, g.capacity,
            (SELECT count(*) FROM enrollments e WHERE e.group_id = g.id AND e.status IN ('active','trial')) AS taken,
            (SELECT string_agg(CASE s.weekday WHEN 1 THEN 'Пн' WHEN 2 THEN 'Вт' WHEN 3 THEN 'Ср' WHEN 4 THEN 'Чт' WHEN 5 THEN 'Пт' WHEN 6 THEN 'Сб' ELSE 'Вс' END
                                || ' ' || to_char(s.start_time,'HH24:MI'), ', ' ORDER BY s.weekday) FROM schedule_slots s WHERE s.group_id = g.id) AS days
       FROM products p LEFT JOIN groups g ON g.product_id = p.id AND g.is_active AND g.end_date >= CURRENT_DATE
       LEFT JOIN branches b ON b.id = g.branch_id
      WHERE p.is_active AND p.show_on_site AND (p.age_from IS NULL OR p.age_from <= $1) AND (p.age_to IS NULL OR p.age_to >= $1)
      ORDER BY p.sort, p.title, g.title`, [a]);
}

// Бизнес-операция 3: запись в группу с проверкой возраста и мест; без мест — лист ожидания
async function enroll({ childId, groupId, status = 'active', price = null }, user) {
  return db.tx(async (q) => {
    const group = await q.one(
      `SELECT g.*, p.age_from, p.age_to, p.title AS product FROM groups g JOIN products p ON p.id = g.product_id WHERE g.id = $1 FOR UPDATE OF g`, [groupId]);
    if (!group || !group.is_active) throw new AppError('Группа не найдена или закрыта', 404);
    if (user.role === 'DIRECTOR' && user.branch_id && group.branch_id !== user.branch_id) throw new AppError('Группа другой точки', 403);
    if (user.role === 'TEACHER' && group.teacher_id !== user.id) throw new AppError('Это группа другого учителя', 403);
    const child = await q.one('SELECT id, full_name, birth_date_enc, parent_id FROM children WHERE id = $1 AND is_active', [childId]);
    if (!child) throw new AppError('Ребёнок не найден', 404);
    const age = ageOf(decrypt(child.birth_date_enc));
    if (age !== null && ((group.age_from && age < group.age_from) || (group.age_to && age > group.age_to))) {
      throw new AppError(`Возраст ребёнка (${age}) не подходит для направления «${group.product}»`);
    }
    const open = await q.one(`SELECT id FROM enrollments WHERE child_id = $1 AND group_id = $2 AND status <> 'finished'`, [childId, groupId]);
    if (open) throw new AppError('Ребёнок уже записан в эту группу или стоит в листе ожидания', 409);
    const taken = (await q.one(`SELECT count(*) AS n FROM enrollments WHERE group_id = $1 AND status IN ('active','trial')`, [groupId])).n;
    let finalStatus = status === 'trial' ? 'trial' : 'active';
    if (taken >= group.capacity) finalStatus = 'waiting';
    const row = await q.one('INSERT INTO enrollments (child_id, group_id, status, price) VALUES ($1,$2,$3,$4) RETURNING id',
      [childId, groupId, finalStatus, price]);
    await audit(user.id, 'enroll', 'enrollments', row.id, { childId, groupId, status: finalStatus }, q);
    const place = finalStatus === 'waiting'
      ? (await q.one(`SELECT count(*) AS n FROM enrollments WHERE group_id = $1 AND status = 'waiting'`, [groupId])).n : null;
    const text = finalStatus === 'waiting'
      ? `Мест в группе «${group.title}» нет. ${child.full_name} поставлен(а) в лист ожидания, номер в очереди: ${place}.`
      : `${child.full_name} записан(а) в группу «${group.title}».`;
    await notify(child.parent_id, text, q);
    return { id: row.id, status: finalStatus, place, text };
  });
}

// Бизнес-операция 4: при освобождении места первый из листа ожидания переводится в группу
async function promoteWaiting(groupId, q = db) {
  const group = await q.one('SELECT title, capacity FROM groups WHERE id = $1', [groupId]);
  const promoted = [];
  for (;;) {
    const taken = (await q.one(`SELECT count(*) AS n FROM enrollments WHERE group_id = $1 AND status IN ('active','trial')`, [groupId])).n;
    if (taken >= group.capacity) break;
    const next = await q.one(
      `SELECT e.id, c.full_name, c.parent_id FROM enrollments e JOIN children c ON c.id = e.child_id
        WHERE e.group_id = $1 AND e.status = 'waiting' ORDER BY e.created_at LIMIT 1`, [groupId]);
    if (!next) break;
    await q.query(`UPDATE enrollments SET status = 'active', start_date = CURRENT_DATE WHERE id = $1`, [next.id]);
    await notify(next.parent_id, `Освободилось место: ${next.full_name} переведён(а) из листа ожидания в группу «${group.title}».`, q);
    promoted.push(next.full_name);
  }
  return promoted;
}

async function finish(enrollmentId, user) {
  return db.tx(async (q) => {
    const e = await q.one(`UPDATE enrollments SET status = 'finished', end_date = CURRENT_DATE WHERE id = $1 AND status <> 'finished' RETURNING group_id, child_id`, [enrollmentId]);
    if (!e) throw new AppError('Запись не найдена', 404);
    await audit(user.id, 'enroll_finish', 'enrollments', enrollmentId, null, q);
    return promoteWaiting(e.group_id, q);
  });
}

async function setStatus(enrollmentId, status, user) {
  v.oneOf(status, ['trial', 'active'], 'Статус');
  await db.query(`UPDATE enrollments SET status = $2 WHERE id = $1 AND status IN ('trial','active')`, [enrollmentId, status]);
  await audit(user.id, 'enroll_status', 'enrollments', enrollmentId, { status });
}

module.exports = { ageOf, suggest, enroll, promoteWaiting, finish, setStatus };
