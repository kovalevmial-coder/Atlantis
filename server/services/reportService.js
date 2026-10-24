// Бизнес-операция 12: отчёты по оплатам, посещаемости, долгам и загрузке, выгрузка в Excel
const ExcelJS = require('exceljs');
const db = require('../config/db');
const dates = require('../utils/dates');
const { METHODS, debtors } = require('./financeService');
const { groupLoad } = require('./loadService');

const period = (q) => {
  const from = dates.isDate(q.from) ? q.from : dates.monthStart(dates.today());
  const to = dates.isDate(q.to) ? q.to : dates.monthEnd(from);
  return { from, to };
};

// Оплаты и начисления за период в разрезе точек, учителей и групп
async function payments({ from, to, branchId = null, teacherId = null }) {
  const byGroup = await db.query(
    `SELECT g.id, g.title, b.name AS branch, u.full_name AS teacher,
            COALESCE((SELECT sum(py.amount) FROM payments py WHERE py.group_id = g.id AND py.paid_at BETWEEN $1 AND $2), 0) AS paid,
            COALESCE((SELECT sum(ch.amount) FROM charges ch JOIN lessons l ON l.id = ch.lesson_id WHERE l.group_id = g.id AND l.lesson_date BETWEEN $1 AND $2), 0) AS charged,
            (SELECT count(*) FROM attendance a JOIN lessons l ON l.id = a.lesson_id WHERE l.group_id = g.id AND a.status = 'sick' AND l.lesson_date BETWEEN $1 AND $2) AS sick_free
       FROM groups g JOIN branches b ON b.id = g.branch_id JOIN users u ON u.id = g.teacher_id
      WHERE ($3::int IS NULL OR g.branch_id = $3) AND ($4::int IS NULL OR g.teacher_id = $4)
      ORDER BY b.name, u.full_name, g.title`, [from, to, branchId, teacherId]);
  const list = await db.query(
    `SELECT to_char(py.paid_at,'YYYY-MM-DD') AS date, c.full_name AS child, py.amount, py.method, b.name AS branch, g.title AS group_title, u.full_name AS received_by, py.comment
       FROM payments py JOIN children c ON c.id = py.child_id JOIN branches b ON b.id = py.branch_id
       LEFT JOIN groups g ON g.id = py.group_id LEFT JOIN users u ON u.id = py.received_by
      WHERE py.paid_at BETWEEN $1 AND $2 AND ($3::int IS NULL OR py.branch_id = $3) AND ($4::int IS NULL OR g.teacher_id = $4)
      ORDER BY py.paid_at, c.full_name`, [from, to, branchId, teacherId]);
  const sum = (arr, k) => Math.round(arr.reduce((s, r) => s + Number(r[k]), 0) * 100) / 100;
  const group = (key) => Object.values(byGroup.reduce((acc, r) => {
    const a = acc[r[key]] || (acc[r[key]] = { name: r[key], paid: 0, charged: 0 });
    a.paid += r.paid; a.charged += r.charged; return acc;
  }, {}));
  const byMethod = Object.keys(METHODS).map((m) => ({ name: METHODS[m], paid: sum(list.filter((p) => p.method === m), 'amount') }));
  return {
    from, to, byGroup, byBranch: group('branch'), byTeacher: group('teacher'), byMethod,
    list: list.map((p) => ({ ...p, methodTitle: METHODS[p.method] })),
    total: { paid: sum(list, 'amount'), charged: sum(byGroup, 'charged'), sickFree: byGroup.reduce((s, r) => s + r.sick_free, 0) }
  };
}

async function attendance({ from, to, branchId = null, teacherId = null }) {
  return db.query(
    `SELECT g.title, u.full_name AS teacher,
            count(*) FILTER (WHERE a.status = 'present') AS present,
            count(*) FILTER (WHERE a.status = 'absent') AS absent,
            count(*) FILTER (WHERE a.status = 'sick') AS sick,
            count(*) FILTER (WHERE a.status = 'excused') AS excused,
            count(DISTINCT l.id) AS lessons
       FROM lessons l JOIN groups g ON g.id = l.group_id JOIN users u ON u.id = g.teacher_id
       LEFT JOIN attendance a ON a.lesson_id = l.id
      WHERE l.status = 'done' AND l.lesson_date BETWEEN $1 AND $2
        AND ($3::int IS NULL OR g.branch_id = $3) AND ($4::int IS NULL OR g.teacher_id = $4)
      GROUP BY g.id, u.full_name ORDER BY g.title`, [from, to, branchId, teacherId]);
}

// Выгрузка отчёта в Excel: листы «Группы», «Оплаты», «Посещаемость», «Долги», «Загрузка»
async function excel(scope) {
  const [pay, att, debt, load] = await Promise.all([payments(scope), attendance(scope), debtors(scope.branchId, scope.teacherId), groupLoad(scope)]);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Атлантис';
  const sheet = (name, columns, rows) => {
    const ws = wb.addWorksheet(name);
    ws.columns = columns.map(([header, key, width]) => ({ header, key, width: width || 16 }));
    ws.getRow(1).font = { bold: true };
    rows.forEach((r) => ws.addRow(r));
    return ws;
  };
  sheet('Группы', [['Точка', 'branch', 20], ['Учитель', 'teacher', 26], ['Группа', 'title', 30], ['Начислено, руб.', 'charged'], ['Оплачено, руб.', 'paid'], ['Занятий по справке', 'sick_free', 18]], pay.byGroup);
  sheet('Оплаты', [['Дата', 'date', 12], ['Ученик', 'child', 28], ['Сумма, руб.', 'amount'], ['Способ', 'methodTitle'], ['Точка', 'branch', 20], ['Группа', 'group_title', 28], ['Принял', 'received_by', 26], ['Комментарий', 'comment', 30]], pay.list);
  sheet('Посещаемость', [['Группа', 'title', 30], ['Учитель', 'teacher', 26], ['Занятий', 'lessons'], ['Был', 'present'], ['Пропуск', 'absent'], ['По справке', 'sick'], ['Отработка', 'excused']], att);
  sheet('Долги', [['Ученик', 'full_name', 28], ['Родитель', 'parent', 28], ['Группы', 'groups', 30], ['Начислено', 'charged'], ['Оплачено', 'paid'], ['Баланс', 'balance']], debt);
  sheet('Загрузка', [['Точка', 'branch', 20], ['Группа', 'title', 30], ['Мест', 'capacity'], ['Записано', 'enrolled'], ['Лист ожидания', 'waiting'], ['План, %', 'plan'], ['Факт, %', 'fact']], load.groups);
  const head = wb.addWorksheet('Итого', { properties: { tabColor: { argb: 'FFA84300' } } });
  head.addRows([['Отчёт за период', `${dates.short(scope.from)} – ${dates.short(scope.to)}`], ['Оплачено, руб.', pay.total.paid], ['Начислено, руб.', pay.total.charged], ['Занятий не оплачивается по справке', pay.total.sickFree]]);
  head.getColumn(1).width = 36; head.getColumn(2).width = 26;
  return wb.xlsx.writeBuffer();
}

module.exports = { period, payments, attendance, excel };
