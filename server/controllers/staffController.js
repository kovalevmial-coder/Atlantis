// Рабочие страницы учителя и директора: расписание, журнал, группы, оплаты, справки, рейтинг, отчёты
const db = require('../config/db');
const schedule = require('../services/scheduleService');
const journal = require('../services/journalService');
const finance = require('../services/financeService');
const rating = require('../services/ratingService');
const load = require('../services/loadService');
const report = require('../services/reportService');
const { branchScope } = require('../middleware/auth');
const { decrypt } = require('../utils/crypto');
const dates = require('../utils/dates');
const { monthNav } = require('../utils/view');

const isTeacher = (u) => u.role === 'TEACHER';
const teacherId = (u) => (isTeacher(u) ? u.id : null);
const base = (u) => (isTeacher(u) ? '/uchitel' : '/direktor');

// Ученики, с которыми работает сотрудник (учитель — своих групп, директор точки — своей точки)
const myKids = (u) => db.query(
  `SELECT c.id, c.full_name,
          string_agg(DISTINCT g.title, ', ') AS groups,
          COALESCE((SELECT sum(amount) FROM payments WHERE child_id = c.id), 0) - COALESCE((SELECT sum(amount) FROM charges WHERE child_id = c.id), 0) AS balance
     FROM children c JOIN enrollments e ON e.child_id = c.id AND e.status <> 'finished' JOIN groups g ON g.id = e.group_id
    WHERE c.is_active AND ($1::int IS NULL OR g.teacher_id = $1) AND ($2::int IS NULL OR g.branch_id = $2)
    GROUP BY c.id ORDER BY c.full_name`, [teacherId(u), branchScope(u)]);

async function home(req, res) {
  const today = dates.today();
  const w = await schedule.week({ type: 'teacher', id: req.user.id, start: today });
  const unmarked = await db.query(
    `SELECT l.id, to_char(l.lesson_date,'YYYY-MM-DD') AS date, to_char(l.start_time,'HH24:MI') AS start, g.title AS group_title, r.name AS room
       FROM lessons l JOIN groups g ON g.id = l.group_id JOIN rooms r ON r.id = l.room_id
      WHERE l.teacher_id = $1 AND l.status = 'planned' AND l.lesson_date < $2 AND l.lesson_date >= $2::date - 60
      ORDER BY l.lesson_date DESC, l.start_time`, [req.user.id, today]);
  const notes = await journal.sickNotes({ teacherId: req.user.id, status: 'pending' });
  res.render('staff/home', { base: '/uchitel', today: w.lessons.filter((l) => l.date === today), unmarked, pendingNotes: notes.length });
}

function raspisanie(req, res) {
  const today = dates.today();
  res.render('staff/raspisanie', { base: base(req.user), from: today, to: dates.addDays(today, 7 * 8) });
}

async function zhurnal(req, res) {
  const l = await journal.lessonCard(Number(req.params.id), req.user);
  const rooms = await db.query('SELECT r.id, r.name FROM rooms r JOIN groups g ON g.branch_id = r.branch_id WHERE g.id = $1 AND r.is_active ORDER BY r.name', [l.group_id]);
  res.render('staff/zhurnal', { base: base(req.user), l, rooms, statuses: journal.STATUSES, today: dates.today() });
}

async function gruppy(req, res) {
  const from = dates.isDate(req.query.from) ? req.query.from : undefined;
  const to = dates.isDate(req.query.to) ? req.query.to : undefined;
  const data = await load.groupLoad({ from, to, branchId: branchScope(req.user), teacherId: teacherId(req.user) });
  res.render('staff/gruppy', { base: base(req.user), load: data });
}

async function gruppa(req, res) {
  const gid = Number(req.params.id);
  await schedule.assertGroupAccess(gid, req.user);
  const g = await db.one(
    `SELECT g.*, to_char(g.start_date,'YYYY-MM-DD') AS start_date, to_char(g.end_date,'YYYY-MM-DD') AS end_date,
            p.title AS product, p.color, b.name AS branch, u.full_name AS teacher, COALESCE(g.price, p.price) AS price_effective
       FROM groups g JOIN products p ON p.id = g.product_id JOIN branches b ON b.id = g.branch_id JOIN users u ON u.id = g.teacher_id
      WHERE g.id = $1`, [gid]);
  const [slots, rooms, kidsRaw] = await Promise.all([
    db.query(`SELECT s.id, s.weekday, to_char(s.start_time,'HH24:MI') AS start, to_char(s.end_time,'HH24:MI') AS "end", r.name AS room
                FROM schedule_slots s JOIN rooms r ON r.id = s.room_id WHERE s.group_id = $1 ORDER BY s.weekday, s.start_time`, [gid]),
    db.query('SELECT id, name FROM rooms WHERE branch_id = $1 AND is_active ORDER BY name', [g.branch_id]),
    db.query(`SELECT c.id, c.full_name, e.id AS enrollment_id, e.status, u.full_name AS parent, u.phone_enc, bf.title AS benefit,
                     COALESCE((SELECT sum(amount) FROM payments WHERE child_id = c.id), 0) - COALESCE((SELECT sum(amount) FROM charges WHERE child_id = c.id), 0) AS balance
                FROM enrollments e JOIN children c ON c.id = e.child_id LEFT JOIN users u ON u.id = c.parent_id LEFT JOIN benefits bf ON bf.id = c.benefit_id
               WHERE e.group_id = $1 AND e.status <> 'finished'
               ORDER BY (e.status = 'waiting'), CASE WHEN e.status = 'waiting' THEN e.created_at END, c.full_name`, [gid])
  ]);
  const kids = kidsRaw.map((k) => ({ ...k, parent_phone: decrypt(k.phone_enc), phone_enc: undefined }));
  const allChildren = req.user.role === 'DIRECTOR'
    ? await db.query(`SELECT id, full_name FROM children WHERE is_active AND id NOT IN (SELECT child_id FROM enrollments WHERE group_id = $1 AND status <> 'finished') ORDER BY full_name`, [gid])
    : [];
  res.render('staff/gruppa', { base: base(req.user), g, slots, rooms, kids, allChildren });
}

async function oplaty(req, res) {
  const u = req.user;
  const [kids, debtors, recent] = await Promise.all([
    myKids(u),
    finance.debtors(branchScope(u), teacherId(u)),
    db.query(`SELECT py.id, to_char(py.paid_at,'YYYY-MM-DD') AS date, c.full_name AS child, py.amount, py.method, g.title AS group_title, r.full_name AS received_by
                FROM payments py JOIN children c ON c.id = py.child_id LEFT JOIN groups g ON g.id = py.group_id LEFT JOIN users r ON r.id = py.received_by
               WHERE ($1::int IS NULL OR g.teacher_id = $1 OR py.received_by = $1) AND ($2::int IS NULL OR py.branch_id = $2)
               ORDER BY py.paid_at DESC, py.id DESC LIMIT 30`, [teacherId(u), branchScope(u)])
  ]);
  res.render('staff/oplaty', { base: base(u), kids, debtors, recent: recent.map((p) => ({ ...p, methodTitle: finance.METHODS[p.method] })), today: dates.today() });
}

async function spravki(req, res) {
  const u = req.user;
  const notes = await journal.sickNotes({ teacherId: teacherId(u), branchId: branchScope(u) });
  res.render('staff/spravki', { base: base(u), notes, kids: await myKids(u) });
}

async function reyting(req, res) {
  const nav = monthNav(req.query.month);
  res.render('staff/reyting', { base: base(req.user), ranking: await rating.ranking({ month: nav.start }), ...nav });
}

// Отчёт: учитель видит свои группы, директор — свою точку или выбранную
function reportScope(req) {
  const u = req.user;
  const { from, to } = report.period(req.query);
  let branchId = branchScope(u);
  if (u.role === 'DIRECTOR' && !branchId && req.query.branch) branchId = Number(req.query.branch) || null;
  return { from, to, branchId, teacherId: teacherId(u) };
}

async function otchety(req, res) {
  const scope = reportScope(req);
  const [rep, att] = await Promise.all([report.payments(scope), report.attendance(scope)]);
  const branches = req.user.role === 'DIRECTOR' && !req.user.branch_id ? await db.query('SELECT id, name FROM branches ORDER BY name') : null;
  res.render('staff/otchety', { base: base(req.user), rep, att, branches, branchId: scope.branchId });
}

async function otchetyXlsx(req, res) {
  const scope = reportScope(req);
  const buf = await report.excel(scope);
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="atlantis-report-${scope.from}-${scope.to}.xlsx"`);
  res.send(Buffer.from(buf));
}

module.exports = { home, raspisanie, zhurnal, gruppy, gruppa, oplaty, spravki, reyting, otchety, otchetyXlsx };
