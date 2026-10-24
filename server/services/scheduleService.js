// Расписание: слоты групп, генерация занятий, проверка пересечений, перенос, недельная сетка
const db = require('../config/db');
const { AppError } = require('../utils/errors');
const v = require('../utils/validate');
const dates = require('../utils/dates');
const { audit, notify } = require('./common');

// Бизнес-операция 6: пересечение слота с другими группами по кабинету или учителю
async function slotConflicts({ groupId, weekday, start, end, roomId, slotId = null }, q = db) {
  const group = await q.one('SELECT teacher_id FROM groups WHERE id = $1', [groupId]);
  return q.query(
    `SELECT s.id, g.title, r.name AS room, u.full_name AS teacher, to_char(s.start_time,'HH24:MI') AS start, to_char(s.end_time,'HH24:MI') AS "end",
            (s.room_id = $5) AS same_room
       FROM schedule_slots s JOIN groups g ON g.id = s.group_id JOIN rooms r ON r.id = s.room_id JOIN users u ON u.id = g.teacher_id
      WHERE g.is_active AND s.weekday = $1 AND s.start_time < $3 AND s.end_time > $2
        AND (s.room_id = $5 OR g.teacher_id = $6) AND s.group_id <> $4 AND ($7::int IS NULL OR s.id <> $7)`,
    [weekday, start, end, groupId, roomId, group.teacher_id, slotId]);
}

function conflictText(list) {
  return 'Пересечение расписания: ' + list.map((c) =>
    `${c.same_room ? `кабинет «${c.room}» занят` : `учитель ${c.teacher} занят`} группой «${c.title}» ${c.start}–${c.end}`).join('; ');
}

async function saveSlot(data, user) {
  const slot = {
    groupId: v.int(data.groupId, { name: 'Группа' }),
    weekday: v.int(data.weekday, { name: 'День недели', min: 1, max: 7 }),
    start: v.time(data.start, { name: 'Начало' }),
    end: v.time(data.end, { name: 'Конец' }),
    roomId: v.int(data.roomId, { name: 'Кабинет' }),
    slotId: data.slotId ? v.int(data.slotId, { name: 'Слот' }) : null
  };
  if (slot.start >= slot.end) throw new AppError('Время окончания должно быть позже начала');
  await assertGroupAccess(slot.groupId, user);
  const room = await db.one('SELECT r.id FROM rooms r JOIN groups g ON g.branch_id = r.branch_id WHERE r.id = $1 AND g.id = $2', [slot.roomId, slot.groupId]);
  if (!room) throw new AppError('Кабинет должен быть в той же точке, что и группа');
  const conflicts = await slotConflicts(slot);
  if (conflicts.length) throw new AppError(conflictText(conflicts), 409);
  let id = slot.slotId;
  if (id) {
    await db.query('UPDATE schedule_slots SET weekday=$2, start_time=$3, end_time=$4, room_id=$5 WHERE id=$1 AND group_id=$6',
      [id, slot.weekday, slot.start, slot.end, slot.roomId, slot.groupId]);
    // Будущие незакрытые занятия этого слота пересоздаются по новому времени
    await db.query(`DELETE FROM lessons l WHERE l.slot_id = $1 AND l.lesson_date >= CURRENT_DATE AND l.status = 'planned'
                     AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.lesson_id = l.id)`, [id]);
  } else {
    id = (await db.one('INSERT INTO schedule_slots (group_id, weekday, start_time, end_time, room_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [slot.groupId, slot.weekday, slot.start, slot.end, slot.roomId])).id;
  }
  await generateLessons(dates.today(), dates.addDays(dates.today(), 7 * 8), slot.groupId);
  await audit(user.id, 'slot_save', 'schedule_slots', id, slot);
  return id;
}

async function deleteSlot(slotId, user) {
  const slot = await db.one('SELECT group_id FROM schedule_slots WHERE id = $1', [slotId]);
  if (!slot) throw new AppError('Слот не найден', 404);
  await assertGroupAccess(slot.group_id, user);
  await db.query(`DELETE FROM lessons l WHERE l.slot_id = $1 AND l.lesson_date >= CURRENT_DATE AND l.status = 'planned'
                   AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.lesson_id = l.id)`, [slotId]);
  await db.query('DELETE FROM schedule_slots WHERE id = $1', [slotId]);
  await audit(user.id, 'slot_delete', 'schedule_slots', slotId);
}

// Учитель может менять только свои группы, директор точки — группы своей точки
async function assertGroupAccess(groupId, user) {
  const g = await db.one('SELECT teacher_id, branch_id FROM groups WHERE id = $1', [groupId]);
  if (!g) throw new AppError('Группа не найдена', 404);
  if (user.role === 'TEACHER' && g.teacher_id !== user.id) throw new AppError('Это группа другого учителя', 403);
  if (user.role === 'DIRECTOR' && user.branch_id && g.branch_id !== user.branch_id) throw new AppError('Группа другой точки', 403);
  if (user.role === 'PARENT') throw new AppError('Недостаточно прав', 403);
  return g;
}

// Бизнес-операция 5: генерация занятий из расписания групп на период
async function generateLessons(from, to, groupId = null) {
  const res = await db.query(
    `INSERT INTO lessons (group_id, slot_id, lesson_date, start_time, end_time, room_id, teacher_id)
     SELECT g.id, s.id, d::date, s.start_time, s.end_time, s.room_id, g.teacher_id
       FROM groups g
       JOIN schedule_slots s ON s.group_id = g.id
       CROSS JOIN generate_series(GREATEST($1::date, g.start_date), LEAST($2::date, g.end_date), interval '1 day') d
      WHERE g.is_active AND EXTRACT(ISODOW FROM d) = s.weekday AND ($3::int IS NULL OR g.id = $3)
     ON CONFLICT (group_id, lesson_date, start_time) DO NOTHING
     RETURNING id`, [from, to, groupId]);
  return res.length;
}

// Бизнес-операция 13: перенос или отмена занятия с проверкой кабинета и уведомлением родителей
async function moveLesson(lessonId, data, user) {
  const lesson = await db.one('SELECT * FROM lessons WHERE id = $1', [lessonId]);
  if (!lesson) throw new AppError('Занятие не найдено', 404);
  await assertGroupAccess(lesson.group_id, user);
  if (lesson.status === 'done') throw new AppError('Проведённое занятие нельзя перенести');
  const group = await db.one('SELECT title FROM groups WHERE id = $1', [lesson.group_id]);
  let text;
  if (data.cancel) {
    await db.query(`UPDATE lessons SET status = 'cancelled', note = $2 WHERE id = $1`, [lessonId, v.str(data.note, { name: 'Причина', max: 255 }) || 'Отменено']);
    text = `Занятие группы «${group.title}» ${dates.short(lesson.lesson_date)} в ${dates.time(lesson.start_time)} отменено.`;
  } else {
    const date = v.date(data.date, { name: 'Дата' });
    const start = v.time(data.start, { name: 'Начало' });
    const end = v.time(data.end, { name: 'Конец' });
    const roomId = v.int(data.roomId || lesson.room_id, { name: 'Кабинет' });
    if (start >= end) throw new AppError('Время окончания должно быть позже начала');
    const busy = await db.query(
      `SELECT g.title, (l.room_id = $4) AS same_room FROM lessons l JOIN groups g ON g.id = l.group_id
        WHERE l.lesson_date = $1 AND l.status <> 'cancelled' AND l.start_time < $3 AND l.end_time > $2
          AND (l.room_id = $4 OR l.teacher_id = $5) AND l.id <> $6`,
      [date, start, end, roomId, lesson.teacher_id, lessonId]);
    if (busy.length) throw new AppError('В это время ' + busy.map((b) => (b.same_room ? `кабинет занят группой «${b.title}»` : `учитель занят группой «${b.title}»`)).join(', '), 409);
    await db.query('UPDATE lessons SET lesson_date=$2, start_time=$3, end_time=$4, room_id=$5, slot_id=NULL, note=$6 WHERE id=$1',
      [lessonId, date, start, end, roomId, `Перенесено с ${dates.short(lesson.lesson_date)} ${dates.time(lesson.start_time)}`]);
    text = `Занятие группы «${group.title}» перенесено с ${dates.short(lesson.lesson_date)} ${dates.time(lesson.start_time)} на ${dates.short(date)} ${start}.`;
  }
  const parents = await db.query(
    `SELECT DISTINCT c.parent_id FROM enrollments e JOIN children c ON c.id = e.child_id
      WHERE e.group_id = $1 AND e.status IN ('active','trial') AND c.parent_id IS NOT NULL`, [lesson.group_id]);
  for (const p of parents) await notify(p.parent_id, text);
  await audit(user.id, data.cancel ? 'lesson_cancel' : 'lesson_move', 'lessons', lessonId, data);
  return text;
}

// Недельная сетка в стиле ИИС БГУИР: занятия группы, учителя, точки, кабинета или детей родителя
async function week({ type, id, start, parentId }) {
  const from = dates.monday(dates.isDate(start) ? start : dates.today());
  const to = dates.addDays(from, 6);
  await generateLessons(from, to);
  const filters = {
    group: 'l.group_id = $3',
    teacher: 'l.teacher_id = $3',
    branch: 'g.branch_id = $3',
    room: 'l.room_id = $3',
    child: `l.group_id IN (SELECT group_id FROM enrollments WHERE child_id = $3 AND status IN ('active','trial'))`,
    parent: `l.group_id IN (SELECT e.group_id FROM enrollments e JOIN children c ON c.id = e.child_id WHERE c.parent_id = $3 AND e.status IN ('active','trial'))`
  };
  if (!filters[type]) throw new AppError('Неизвестный тип расписания');
  const lessons = await db.query(
    `SELECT l.id, l.group_id, to_char(l.lesson_date,'YYYY-MM-DD') AS date, to_char(l.start_time,'HH24:MI') AS start, to_char(l.end_time,'HH24:MI') AS "end",
            l.status, l.note, l.topic, r.name AS room, r.id AS room_id, b.name AS branch,
            g.title AS group_title, g.capacity, p.title AS product, p.code, p.color, p.slug AS product_slug,
            u.id AS teacher_id, u.full_name AS teacher, tp.slug AS teacher_slug,
            (SELECT count(*) FROM enrollments e WHERE e.group_id = g.id AND e.status IN ('active','trial')) AS taken
       FROM lessons l
       JOIN groups g ON g.id = l.group_id JOIN products p ON p.id = g.product_id
       JOIN rooms r ON r.id = l.room_id JOIN branches b ON b.id = g.branch_id
       JOIN users u ON u.id = l.teacher_id LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
      WHERE l.lesson_date BETWEEN $1 AND $2 AND ${filters[type]}
      ORDER BY l.lesson_date, l.start_time`, [from, to, type === 'parent' ? parentId : id]);
  return { from, to, today: dates.today(), lessons };
}

// Список объектов для поиска в расписании (группы, учителя, кабинеты, точки)
async function catalog() {
  const [groups, teachers, rooms, branches] = await Promise.all([
    db.query(`SELECT g.id, g.title, p.title AS product, p.code, p.color, b.name AS branch, u.full_name AS teacher, g.start_date, g.end_date, g.capacity,
                     (SELECT count(*) FROM enrollments e WHERE e.group_id = g.id AND e.status IN ('active','trial')) AS taken
                FROM groups g JOIN products p ON p.id = g.product_id JOIN branches b ON b.id = g.branch_id JOIN users u ON u.id = g.teacher_id
               WHERE g.is_active ORDER BY g.title`),
    db.query(`SELECT u.id, u.full_name, tp.slug, tp.position, tp.photo_id, tp.photo_url FROM users u LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
               WHERE u.role IN ('TEACHER','DIRECTOR') AND u.is_active AND EXISTS (SELECT 1 FROM groups g WHERE g.teacher_id = u.id AND g.is_active)
               ORDER BY u.full_name`),
    db.query(`SELECT r.id, r.name, b.name AS branch FROM rooms r JOIN branches b ON b.id = r.branch_id WHERE r.is_active ORDER BY b.name, r.name`),
    db.query('SELECT id, name, address FROM branches WHERE is_active ORDER BY name')
  ]);
  return { groups, teachers, rooms, branches };
}

module.exports = { slotConflicts, saveSlot, deleteSlot, assertGroupAccess, generateLessons, moveLesson, week, catalog };
