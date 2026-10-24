// Начисления, оплаты, баланс (долг или переплата)
const db = require('../config/db');
const { AppError } = require('../utils/errors');
const v = require('../utils/validate');
const dates = require('../utils/dates');
const { audit, notify } = require('./common');

const METHODS = { cash: 'Наличные', card: 'Карта', erip: 'ЕРИП' };

// Стоимость одного занятия для ребёнка: индивидуальная цена → цена группы → цена продукта, минус льгота
const PRICE_SQL = `ROUND(COALESCE(e.price, g.price, p.price) * (1 - COALESCE(bf.discount_pct, 0) / 100.0), 2)`;

// Бизнес-операция 7 (часть): начисления за проведённое занятие
async function chargeLesson(lessonId, q = db) {
  // Начисляем за «был» и «пропуск без справки»; за «по справке» и «отработку» начисление снимается
  await q.query(
    `DELETE FROM charges ch USING attendance a
      WHERE ch.lesson_id = $1 AND a.lesson_id = ch.lesson_id AND a.child_id = ch.child_id AND a.status IN ('sick','excused')`, [lessonId]);
  await q.query(
    `INSERT INTO charges (child_id, lesson_id, amount)
     SELECT a.child_id, a.lesson_id, ${PRICE_SQL}
       FROM attendance a JOIN lessons l ON l.id = a.lesson_id JOIN groups g ON g.id = l.group_id JOIN products p ON p.id = g.product_id
       JOIN children c ON c.id = a.child_id LEFT JOIN benefits bf ON bf.id = c.benefit_id AND bf.is_active
       LEFT JOIN enrollments e ON e.child_id = a.child_id AND e.group_id = g.id AND e.status <> 'finished'
      WHERE a.lesson_id = $1 AND a.status IN ('present','absent') AND l.status = 'done'
     ON CONFLICT (child_id, lesson_id) DO UPDATE SET amount = EXCLUDED.amount`, [lessonId]);
}

// Бизнес-операция 9: баланс ребёнка = оплаты − начисления
async function balance(childId) {
  const row = await db.one(
    `SELECT COALESCE((SELECT sum(amount) FROM payments WHERE child_id = $1), 0) AS paid,
            COALESCE((SELECT sum(amount) FROM charges WHERE child_id = $1), 0) AS charged`, [childId]);
  return { paid: row.paid, charged: row.charged, balance: Math.round((row.paid - row.charged) * 100) / 100 };
}

async function history(childId) {
  const [charges, payments] = await Promise.all([
    db.query(`SELECT ch.amount, to_char(l.lesson_date,'YYYY-MM-DD') AS date, to_char(l.start_time,'HH24:MI') AS time, g.title AS group_title, a.status
                FROM charges ch JOIN lessons l ON l.id = ch.lesson_id JOIN groups g ON g.id = l.group_id
                LEFT JOIN attendance a ON a.lesson_id = l.id AND a.child_id = ch.child_id
               WHERE ch.child_id = $1 ORDER BY l.lesson_date DESC, l.start_time DESC`, [childId]),
    db.query(`SELECT py.id, py.amount, to_char(py.paid_at,'YYYY-MM-DD') AS date, py.method, py.comment, b.name AS branch, g.title AS group_title, u.full_name AS received_by
                FROM payments py JOIN branches b ON b.id = py.branch_id LEFT JOIN groups g ON g.id = py.group_id LEFT JOIN users u ON u.id = py.received_by
               WHERE py.child_id = $1 ORDER BY py.paid_at DESC, py.id DESC`, [childId])
  ]);
  return { charges, payments: payments.map((p) => ({ ...p, methodTitle: METHODS[p.method] })) };
}

// Приём оплаты учителем или директором
async function addPayment(data, user) {
  const childId = v.int(data.childId, { name: 'Ученик' });
  const amount = v.num(data.amount, { name: 'Сумма', min: 0.01 });
  const method = v.oneOf(data.method, Object.keys(METHODS), 'Способ оплаты');
  const paidAt = v.date(data.paidAt || dates.today(), { name: 'Дата' });
  const groupId = data.groupId ? v.int(data.groupId, { name: 'Группа' }) : null;
  const comment = v.str(data.comment, { name: 'Комментарий', max: 255 });
  // Учитель принимает оплату только у детей своих групп
  const access = await db.one(
    `SELECT g.id, g.branch_id FROM enrollments e JOIN groups g ON g.id = e.group_id
      WHERE e.child_id = $1 AND ($2::int IS NULL OR g.id = $2)
        AND ($3 <> 'TEACHER' OR g.teacher_id = $4) AND ($5::int IS NULL OR g.branch_id = $5)
      ORDER BY (e.status <> 'finished') DESC LIMIT 1`,
    [childId, groupId, user.role, user.id, user.role === 'DIRECTOR' ? user.branch_id : null]);
  if (!access) throw new AppError('Ребёнок не занимается в ваших группах', 403);
  const branchId = data.branchId ? v.int(data.branchId, { name: 'Точка' }) : access.branch_id;
  const row = await db.one(
    `INSERT INTO payments (child_id, group_id, amount, paid_at, method, branch_id, received_by, comment)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [childId, groupId || access.id, amount, paidAt, method, branchId, user.id, comment]);
  await audit(user.id, 'payment_add', 'payments', row.id, { childId, amount, method });
  const child = await db.one('SELECT full_name, parent_id FROM children WHERE id = $1', [childId]);
  await notify(child.parent_id, `Получена оплата ${amount.toFixed(2).replace(".", ",")} руб. за ${child.full_name} (${METHODS[method]}).`);
  return row.id;
}

async function deletePayment(id, user) {
  if (user.role !== 'DIRECTOR') throw new AppError('Удалять оплаты может только директор', 403);
  const row = await db.one('DELETE FROM payments WHERE id = $1 RETURNING child_id, amount', [id]);
  if (!row) throw new AppError('Оплата не найдена', 404);
  await audit(user.id, 'payment_delete', 'payments', id, row);
}

// Должники: дети с отрицательным балансом
async function debtors(branchId = null, teacherId = null) {
  return db.query(
    `SELECT c.id, c.full_name, u.full_name AS parent, u.id AS parent_id,
            COALESCE(pay.s, 0) AS paid, COALESCE(chg.s, 0) AS charged, COALESCE(pay.s, 0) - COALESCE(chg.s, 0) AS balance,
            (SELECT string_agg(g.title, ', ') FROM enrollments e JOIN groups g ON g.id = e.group_id WHERE e.child_id = c.id AND e.status <> 'finished') AS groups
       FROM children c LEFT JOIN users u ON u.id = c.parent_id
       LEFT JOIN (SELECT child_id, sum(amount) s FROM payments GROUP BY child_id) pay ON pay.child_id = c.id
       LEFT JOIN (SELECT child_id, sum(amount) s FROM charges GROUP BY child_id) chg ON chg.child_id = c.id
      WHERE COALESCE(pay.s, 0) - COALESCE(chg.s, 0) < 0
        AND ($1::int IS NULL OR EXISTS (SELECT 1 FROM enrollments e JOIN groups g ON g.id = e.group_id WHERE e.child_id = c.id AND g.branch_id = $1))
        AND ($2::int IS NULL OR EXISTS (SELECT 1 FROM enrollments e JOIN groups g ON g.id = e.group_id WHERE e.child_id = c.id AND g.teacher_id = $2))
      ORDER BY balance`, [branchId, teacherId]);
}

// Напоминание родителям о долге
async function remindDebtors(user) {
  const list = await debtors(user.role === 'DIRECTOR' ? user.branch_id : null, user.role === 'TEACHER' ? user.id : null);
  let sent = 0;
  for (const d of list) {
    if (!d.parent_id) continue;
    await notify(d.parent_id, `Напоминание об оплате: задолженность за ${d.full_name} составляет ${Math.abs(d.balance).toFixed(2).replace(".", ",")} руб.`);
    sent += 1;
  }
  await audit(user.id, 'debt_remind', null, null, { sent });
  return sent;
}

module.exports = { METHODS, PRICE_SQL, chargeLesson, balance, history, addPayment, deletePayment, debtors, remindDebtors };
