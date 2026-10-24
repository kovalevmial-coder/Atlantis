// Бизнес-операция 11: плановая и фактическая загрузка групп
const db = require('../config/db');
const dates = require('../utils/dates');

async function groupLoad({ from, to, branchId = null, teacherId = null }) {
  const f = from || dates.monthStart(dates.today());
  const t = to || dates.monthEnd(f);
  const rows = await db.query(
    `SELECT g.id, g.title, g.capacity, b.name AS branch, u.full_name AS teacher, p.title AS product,
            (SELECT count(*) FROM enrollments e WHERE e.group_id = g.id AND e.status IN ('active','trial')) AS enrolled,
            (SELECT count(*) FROM enrollments e WHERE e.group_id = g.id AND e.status = 'waiting') AS waiting,
            (SELECT count(*) FROM lessons l WHERE l.group_id = g.id AND l.status = 'done' AND l.lesson_date BETWEEN $1 AND $2) AS lessons_done,
            (SELECT count(*) FROM attendance a JOIN lessons l ON l.id = a.lesson_id
              WHERE l.group_id = g.id AND a.status = 'present' AND l.lesson_date BETWEEN $1 AND $2) AS present
       FROM groups g JOIN branches b ON b.id = g.branch_id JOIN users u ON u.id = g.teacher_id JOIN products p ON p.id = g.product_id
      WHERE g.is_active AND ($3::int IS NULL OR g.branch_id = $3) AND ($4::int IS NULL OR g.teacher_id = $4)
      ORDER BY b.name, g.title`, [f, t, branchId, teacherId]);
  return {
    from: f, to: t,
    groups: rows.map((r) => {
      const plan = Math.round((r.enrolled / r.capacity) * 100);
      const fact = r.lessons_done ? Math.round((r.present / r.lessons_done / r.capacity) * 100) : null;
      const level = plan > 90 ? 'high' : plan < 50 ? 'low' : 'ok';
      return { ...r, plan, fact, level };
    })
  };
}

module.exports = { groupLoad };
