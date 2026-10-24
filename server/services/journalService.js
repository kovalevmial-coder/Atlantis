// Журнал занятия: посещаемость, баллы рейтинга, тема, домашнее задание, справки
const db = require('../config/db');
const { AppError } = require('../utils/errors');
const v = require('../utils/validate');
const dates = require('../utils/dates');
const { assertGroupAccess } = require('./scheduleService');
const { chargeLesson } = require('./financeService');
const { audit, notify, saveFile } = require('./common');

const STATUSES = { present: 'Был', absent: 'Пропуск', sick: 'По справке', excused: 'Отработка' };

async function lessonCard(lessonId, user) {
  const lesson = await db.one(
    `SELECT l.id, l.group_id, to_char(l.lesson_date,'YYYY-MM-DD') AS date, to_char(l.start_time,'HH24:MI') AS start, to_char(l.end_time,'HH24:MI') AS "end",
            l.status, l.topic, l.note, g.title AS group_title, p.title AS product, p.color, r.name AS room, u.full_name AS teacher
       FROM lessons l JOIN groups g ON g.id = l.group_id JOIN products p ON p.id = g.product_id JOIN rooms r ON r.id = l.room_id JOIN users u ON u.id = l.teacher_id
      WHERE l.id = $1`, [lessonId]);
  if (!lesson) throw new AppError('Занятие не найдено', 404);
  await assertGroupAccess(lesson.group_id, user);
  // Дети группы на дату занятия + уже отмеченные + действующие справки
  lesson.children = await db.query(
    `SELECT c.id, c.full_name, e.status AS enroll_status, a.status, a.points, a.comment,
            EXISTS (SELECT 1 FROM sick_notes s WHERE s.child_id = c.id AND s.status = 'accepted' AND $2::date BETWEEN s.date_from AND s.date_to) AS has_note
       FROM children c
       LEFT JOIN enrollments e ON e.child_id = c.id AND e.group_id = $3 AND e.status IN ('active','trial') AND e.start_date <= $2::date
       LEFT JOIN attendance a ON a.lesson_id = $1 AND a.child_id = c.id
      WHERE e.id IS NOT NULL OR a.child_id IS NOT NULL
      ORDER BY c.full_name`, [lessonId, lesson.date, lesson.group_id]);
  lesson.homework = await db.query('SELECT id, text, file_id, to_char(due_date,\'YYYY-MM-DD\') AS due_date FROM homework WHERE lesson_id = $1 ORDER BY id', [lessonId]);
  return lesson;
}

// Бизнес-операция 7: отметка посещаемости, баллы, закрытие занятия и автоматические начисления
async function saveJournal(lessonId, data, user, file) {
  const lesson = await lessonCard(lessonId, user);
  if (lesson.status === 'cancelled') throw new AppError('Занятие отменено');
  if (lesson.date > dates.today()) throw new AppError('Отмечать посещаемость можно в день занятия или позже');
  const marks = Array.isArray(data.marks) ? data.marks : JSON.parse(data.marks || '[]');
  const allowed = new Set(lesson.children.map((c) => c.id));
  await db.tx(async (q) => {
    for (const m of marks) {
      const childId = Number(m.childId);
      if (!allowed.has(childId)) throw new AppError('Ребёнок не из этой группы');
      let status = v.oneOf(m.status, Object.keys(STATUSES), 'Статус');
      // Пропуск в период принятой справки автоматически становится «по справке»
      const child = lesson.children.find((c) => c.id === childId);
      if (status === 'absent' && child.has_note) status = 'sick';
      const points = status === 'present' && m.points !== '' && m.points !== null && m.points !== undefined
        ? v.int(m.points, { name: 'Баллы', min: 0, max: 10 }) : null;
      await q.query(
        `INSERT INTO attendance (lesson_id, child_id, status, points, comment, marked_by) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (lesson_id, child_id) DO UPDATE SET status=EXCLUDED.status, points=EXCLUDED.points, comment=EXCLUDED.comment, marked_by=EXCLUDED.marked_by, marked_at=now()`,
        [lessonId, childId, status, points, v.str(m.comment, { name: 'Комментарий', max: 255 }) || null, user.id]);
    }
    await q.query(`UPDATE lessons SET status = 'done', topic = $2 WHERE id = $1`, [lessonId, v.str(data.topic, { name: 'Тема', max: 255 }) || null]);
    const hw = v.str(data.homework, { name: 'Домашнее задание', max: 2000 });
    if (hw || file) {
      const fileId = await saveFile(file, q);
      await q.query('INSERT INTO homework (lesson_id, text, file_id, due_date, created_by) VALUES ($1,$2,$3,$4,$5)',
        [lessonId, hw || 'Задание во вложении', fileId, v.date(data.dueDate, { name: 'Срок', required: false }), user.id]);
      const parents = await q.query(`SELECT DISTINCT c.parent_id FROM attendance a JOIN children c ON c.id = a.child_id WHERE a.lesson_id = $1 AND c.parent_id IS NOT NULL`, [lessonId]);
      for (const p of parents) await notify(p.parent_id, `Новое домашнее задание по группе «${lesson.group_title}».`, q);
    }
    await chargeLesson(lessonId, q);
    await audit(user.id, 'journal_save', 'lessons', lessonId, { count: marks.length }, q);
  });
  return lessonCard(lessonId, user);
}

async function deleteHomework(id, user) {
  const hw = await db.one('SELECT h.id, l.group_id FROM homework h JOIN lessons l ON l.id = h.lesson_id WHERE h.id = $1', [id]);
  if (!hw) throw new AppError('Задание не найдено', 404);
  await assertGroupAccess(hw.group_id, user);
  await db.query('DELETE FROM homework WHERE id = $1', [id]);
}

// Справка: загружает родитель (или сотрудник), проверяет учитель или директор
async function uploadSickNote(data, file, user) {
  const childId = v.int(data.childId, { name: 'Ребёнок' });
  if (user.role === 'PARENT') {
    const own = await db.one('SELECT id FROM children WHERE id = $1 AND parent_id = $2', [childId, user.id]);
    if (!own) throw new AppError('Это не ваш ребёнок', 403);
  }
  const from = v.date(data.dateFrom, { name: 'С' });
  const to = v.date(data.dateTo, { name: 'По' });
  if (from > to) throw new AppError('Дата «с» должна быть не позже даты «по»');
  if (!file) throw new AppError('Прикрепите скан или фото справки');
  const fileId = await saveFile(file);
  const status = user.role === 'PARENT' ? 'pending' : 'accepted';
  const row = await db.one(
    `INSERT INTO sick_notes (child_id, date_from, date_to, file_id, status, comment, uploaded_by, reviewed_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [childId, from, to, fileId, status, v.str(data.comment, { name: 'Комментарий', max: 255 }) || null, user.id, status === 'accepted' ? user.id : null]);
  if (status === 'accepted') await applySickNote(row.id);
  await audit(user.id, 'sick_note_upload', 'sick_notes', row.id);
  return row.id;
}

// Бизнес-операция 8: принятая справка переводит пропуски периода в «по справке» и снимает начисления
async function applySickNote(noteId, q = db) {
  const note = await q.one('SELECT * FROM sick_notes WHERE id = $1', [noteId]);
  const changed = await q.query(
    `UPDATE attendance a SET status = 'sick' FROM lessons l
      WHERE a.lesson_id = l.id AND a.child_id = $1 AND a.status = 'absent' AND l.lesson_date BETWEEN $2 AND $3
      RETURNING a.lesson_id`, [note.child_id, note.date_from, note.date_to]);
  if (changed.length) {
    await q.query('DELETE FROM charges WHERE child_id = $1 AND lesson_id = ANY($2::int[])', [note.child_id, changed.map((c) => c.lesson_id)]);
  }
  return changed.length;
}

async function reviewSickNote(noteId, accept, user, comment) {
  const note = await db.one(
    `SELECT s.*, c.full_name, c.parent_id FROM sick_notes s JOIN children c ON c.id = s.child_id WHERE s.id = $1`, [noteId]);
  if (!note) throw new AppError('Справка не найдена', 404);
  if (user.role === 'TEACHER') {
    const ok = await db.one(`SELECT 1 FROM enrollments e JOIN groups g ON g.id = e.group_id WHERE e.child_id = $1 AND g.teacher_id = $2`, [note.child_id, user.id]);
    if (!ok) throw new AppError('Ребёнок не из ваших групп', 403);
  }
  return db.tx(async (q) => {
    await q.query('UPDATE sick_notes SET status = $2, reviewed_by = $3, comment = COALESCE($4, comment) WHERE id = $1',
      [noteId, accept ? 'accepted' : 'rejected', user.id, comment || null]);
    const n = accept ? await applySickNote(noteId, q) : 0;
    await notify(note.parent_id, accept
      ? `Справка за ${note.full_name} (${dates.short(note.date_from)}–${dates.short(note.date_to)}) принята. Пропущенные занятия не оплачиваются.`
      : `Справка за ${note.full_name} отклонена${comment ? ': ' + comment : ''}.`, q);
    await audit(user.id, accept ? 'sick_note_accept' : 'sick_note_reject', 'sick_notes', noteId, { lessons: n }, q);
    return n;
  });
}

async function sickNotes({ childIds = null, teacherId = null, branchId = null, status = null }) {
  return db.query(
    `SELECT s.id, s.child_id, c.full_name, to_char(s.date_from,'YYYY-MM-DD') AS date_from, to_char(s.date_to,'YYYY-MM-DD') AS date_to,
            s.status, s.comment, s.file_id, to_char(s.created_at,'YYYY-MM-DD') AS created
       FROM sick_notes s JOIN children c ON c.id = s.child_id
      WHERE ($1::int[] IS NULL OR s.child_id = ANY($1))
        AND ($2::int IS NULL OR EXISTS (SELECT 1 FROM enrollments e JOIN groups g ON g.id = e.group_id WHERE e.child_id = c.id AND g.teacher_id = $2))
        AND ($3::int IS NULL OR EXISTS (SELECT 1 FROM enrollments e JOIN groups g ON g.id = e.group_id WHERE e.child_id = c.id AND g.branch_id = $3))
        AND ($4::text IS NULL OR s.status = $4)
      ORDER BY (s.status = 'pending') DESC, s.created_at DESC`, [childIds, teacherId, branchId, status]);
}

// Посещаемость ребёнка за месяц (для календаря в кабинете)
async function childAttendance(childId, month) {
  const from = dates.monthStart(month || dates.today());
  return db.query(
    `SELECT to_char(l.lesson_date,'YYYY-MM-DD') AS date, to_char(l.start_time,'HH24:MI') AS start, g.title AS group_title, p.color,
            l.status AS lesson_status, a.status, a.points, a.comment, l.topic
       FROM lessons l JOIN groups g ON g.id = l.group_id JOIN products p ON p.id = g.product_id
       JOIN enrollments e ON e.group_id = g.id AND e.child_id = $1 AND e.status IN ('active','trial','finished')
                         AND e.start_date <= l.lesson_date AND (e.end_date IS NULL OR e.end_date >= l.lesson_date)
       LEFT JOIN attendance a ON a.lesson_id = l.id AND a.child_id = $1
      WHERE l.lesson_date BETWEEN $2 AND $3
      ORDER BY l.lesson_date, l.start_time`, [childId, from, dates.monthEnd(from)]);
}

async function childHomework(childId) {
  return db.query(
    `SELECT h.id, h.text, h.file_id, to_char(h.due_date,'YYYY-MM-DD') AS due_date, to_char(l.lesson_date,'YYYY-MM-DD') AS lesson_date,
            g.title AS group_title, l.topic
       FROM homework h JOIN lessons l ON l.id = h.lesson_id JOIN groups g ON g.id = l.group_id
       JOIN enrollments e ON e.group_id = g.id AND e.child_id = $1 AND e.status <> 'waiting'
      ORDER BY l.lesson_date DESC LIMIT 50`, [childId]);
}

module.exports = { STATUSES, lessonCard, saveJournal, deleteHomework, uploadSickNote, applySickNote, reviewSickNote, sickNotes, childAttendance, childHomework };
