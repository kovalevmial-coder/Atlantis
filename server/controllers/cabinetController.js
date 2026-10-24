// Личный кабинет родителя
const db = require('../config/db');
const schedule = require('../services/scheduleService');
const journal = require('../services/journalService');
const finance = require('../services/financeService');
const rating = require('../services/ratingService');
const { ageOf } = require('../services/enrollmentService');
const { decrypt } = require('../utils/crypto');
const dates = require('../utils/dates');
const { monthNav } = require('../utils/view');

async function myChildren(userId) {
  return db.query(
    `SELECT c.id, c.full_name, c.grade, c.rating_consent, c.birth_date_enc, b.title AS benefit
       FROM children c LEFT JOIN benefits b ON b.id = c.benefit_id
      WHERE c.parent_id = $1 AND c.is_active ORDER BY c.full_name`, [userId]);
}

// Выбранный ребёнок (?child=) из детей родителя
async function pick(req) {
  const children = await myChildren(req.user.id);
  const child = children.find((c) => String(c.id) === String(req.query.child)) || children[0] || null;
  return { children, child };
}

const notifications = (userId, limit = 50) => db.query(
  `SELECT id, text, is_read, to_char(created_at,'YYYY-MM-DD') AS created FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`, [userId, limit]);

async function home(req, res) {
  const children = await myChildren(req.user.id);
  const today = dates.today();
  for (const c of children) {
    c.age = ageOf(decrypt(c.birth_date_enc));
    c.balance = await finance.balance(c.id);
    c.groups = await db.query(
      `SELECT g.title, e.status, u.full_name AS teacher, p.color,
              ROUND(COALESCE(e.price, g.price, p.price) * (1 - COALESCE(bf.discount_pct, 0) / 100.0), 2) AS price
         FROM enrollments e JOIN groups g ON g.id = e.group_id JOIN products p ON p.id = g.product_id JOIN users u ON u.id = g.teacher_id
         JOIN children c ON c.id = e.child_id LEFT JOIN benefits bf ON bf.id = c.benefit_id AND bf.is_active
        WHERE e.child_id = $1 AND e.status <> 'finished' ORDER BY g.title`, [c.id]);
    const w1 = await schedule.week({ type: 'child', id: c.id, start: today });
    const w2 = await schedule.week({ type: 'child', id: c.id, start: dates.addDays(today, 7) });
    c.next = [...w1.lessons, ...w2.lessons].filter((l) => l.date >= today).slice(0, 4);
    c.rating = await rating.childRating(c.id, today);
    const att = await db.one(
      `SELECT count(*) FILTER (WHERE a.status IN ('present','excused')) AS ok, count(*) AS total
         FROM attendance a JOIN lessons l ON l.id = a.lesson_id WHERE a.child_id = $1 AND l.lesson_date BETWEEN $2 AND $3`,
      [c.id, dates.monthStart(today), dates.monthEnd(today)]);
    c.attRate = att.total ? Math.round((att.ok / att.total) * 100) : null;
  }
  res.render('cabinet/home', { children, notifications: await notifications(req.user.id, 5) });
}

function raspisanie(req, res) {
  res.render('cabinet/raspisanie');
}

async function poseshchaemost(req, res) {
  const { children, child } = await pick(req);
  const nav = monthNav(req.query.month);
  const today = dates.today();
  let rows = []; let days = []; const totals = { present: 0, absent: 0, sick: 0 };
  if (child) {
    rows = await journal.childAttendance(child.id, nav.start);
    const last = Number(nav.end.slice(8));
    for (let d = 1; d <= last; d += 1) {
      const date = `${nav.month}-${String(d).padStart(2, '0')}`;
      const list = rows.filter((r) => r.date === date && r.lesson_status !== 'cancelled');
      let cls = '';
      if (list.some((r) => r.status === 'absent')) cls = 'absent';
      else if (list.some((r) => r.status === 'sick')) cls = 'sick';
      else if (list.some((r) => r.status === 'present' || r.status === 'excused')) cls = 'present';
      else if (list.length && date >= today) cls = 'planned';
      const title = list.map((r) => `${r.start} ${r.group_title}: ${r.status ? journal.STATUSES[r.status] : (date >= today ? 'запланировано' : 'не отмечено')}`).join('; ');
      days.push({ day: d, cls, title });
    }
    rows.forEach((r) => { if (totals[r.status] !== undefined) totals[r.status] += 1; if (r.status === 'excused') totals.present += 1; });
  }
  res.render('cabinet/poseshchaemost', {
    children, child, rows, days, totals, today, statuses: journal.STATUSES,
    firstWeekday: dates.weekday(nav.start) - 1, ...nav
  });
}

async function oplaty(req, res) {
  const { children, child } = await pick(req);
  const bal = child ? await finance.balance(child.id) : null;
  const hist = child ? await finance.history(child.id) : null;
  res.render('cabinet/oplaty', { children, child, bal, hist });
}

async function domashka(req, res) {
  const { children, child } = await pick(req);
  res.render('cabinet/domashka', { children, child, list: child ? await journal.childHomework(child.id) : [], today: dates.today() });
}

async function reyting(req, res) {
  const { children, child } = await pick(req);
  const nav = monthNav(req.query.month);
  const mine = child ? await rating.childRating(child.id, nav.start) : [];
  const top = await rating.ranking({ month: nav.start, publicOnly: true, limit: 10 });
  res.render('cabinet/reyting', { children, child, mine, top, ...nav });
}

async function spravki(req, res) {
  const children = await myChildren(req.user.id);
  const notes = children.length ? await journal.sickNotes({ childIds: children.map((c) => c.id) }) : [];
  res.render('cabinet/spravki', { children, notes });
}

// Профиль общий для всех ролей
async function profil(req, res) {
  const u = await db.one('SELECT phone_enc FROM users WHERE id = $1', [req.user.id]);
  const children = req.user.role === 'PARENT' ? await myChildren(req.user.id) : [];
  res.render('cabinet/profil', { phone: decrypt(u.phone_enc), children, notifications: await notifications(req.user.id) });
}

module.exports = { home, raspisanie, poseshchaemost, oplaty, domashka, reyting, spravki, profil };
