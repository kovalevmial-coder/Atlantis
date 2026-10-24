// REST API рабочих операций: расписание, журнал, справки, оплаты, запись в группы
const db = require('../config/db');
const schedule = require('../services/scheduleService');
const journal = require('../services/journalService');
const finance = require('../services/financeService');
const enrollment = require('../services/enrollmentService');
const { AppError } = require('../utils/errors');
const v = require('../utils/validate');
const dates = require('../utils/dates');

const id = (req) => v.int(req.params.id, { name: 'Номер записи', min: 1 });

async function saveSlot(req, res) {
  await schedule.saveSlot(req.body || {}, req.user);
  res.json({ message: 'Время сохранено, занятия созданы на 8 недель вперёд' });
}

async function deleteSlot(req, res) {
  await schedule.deleteSlot(id(req), req.user);
  res.json({ message: 'Время удалено из расписания' });
}

async function generate(req, res) {
  const from = v.date(req.body.from, { name: 'С' });
  const to = v.date(req.body.to, { name: 'По' });
  if (from > to) throw new AppError('Дата «с» должна быть не позже даты «по»');
  if (dates.parse(to) - dates.parse(from) > 366 * 864e5) throw new AppError('Период не больше года');
  const n = await schedule.generateLessons(from, to);
  res.json({ message: `Создано новых занятий: ${n}` });
}

async function saveJournal(req, res) {
  await journal.saveJournal(id(req), req.body || {}, req.user, req.file);
  res.json({ message: 'Журнал сохранён, начисления пересчитаны' });
}

async function moveLesson(req, res) {
  const b = req.body || {};
  const text = await schedule.moveLesson(id(req), { ...b, cancel: v.bool(b.cancel) }, req.user);
  res.json({ message: text });
}

async function deleteHomework(req, res) {
  await journal.deleteHomework(id(req), req.user);
  res.json({ message: 'Задание удалено' });
}

async function uploadSickNote(req, res) {
  await journal.uploadSickNote(req.body || {}, req.file, req.user);
  res.status(201).json({ message: req.user.role === 'PARENT' ? 'Справка отправлена на проверку' : 'Справка сохранена и применена' });
}

const reviewSickNote = (accept) => async (req, res) => {
  const n = await journal.reviewSickNote(id(req), accept, req.user, v.str((req.body || {}).comment, { name: 'Комментарий', max: 255 }));
  res.json({ message: accept ? `Справка принята, переотмечено занятий: ${n}` : 'Справка отклонена' });
};

async function addPayment(req, res) {
  await finance.addPayment(req.body || {}, req.user);
  res.status(201).json({ message: 'Оплата принята' });
}

async function deletePayment(req, res) {
  await finance.deletePayment(id(req), req.user);
  res.json({ message: 'Оплата удалена' });
}

async function remind(req, res) {
  const n = await finance.remindDebtors(req.user);
  res.json({ message: `Отправлено напоминаний: ${n}` });
}

async function enroll(req, res) {
  const b = req.body || {};
  const r = await enrollment.enroll({
    childId: v.int(b.childId, { name: 'Ученик' }),
    groupId: v.int(b.groupId, { name: 'Группа' }),
    status: b.status,
    price: v.num(b.price, { name: 'Цена', min: 0, required: false })
  }, req.user);
  res.status(201).json({ message: r.text });
}

// Директор точки работает только с записями своей точки
async function assertEnrollment(enrollmentId, user) {
  const e = await db.one('SELECT g.branch_id FROM enrollments e JOIN groups g ON g.id = e.group_id WHERE e.id = $1', [enrollmentId]);
  if (!e) throw new AppError('Запись не найдена', 404);
  if (user.branch_id && e.branch_id !== user.branch_id) throw new AppError('Группа другой точки', 403);
}

async function finishEnrollment(req, res) {
  await assertEnrollment(id(req), req.user);
  const promoted = await enrollment.finish(id(req), req.user);
  res.json({ message: promoted.length ? `Ученик отчислен. Из листа ожидания в группу переведены: ${promoted.join(', ')}` : 'Ученик отчислен из группы' });
}

async function enrollmentStatus(req, res) {
  await assertEnrollment(id(req), req.user);
  await enrollment.setStatus(id(req), (req.body || {}).status, req.user);
  res.json({ message: 'Статус изменён' });
}

async function consent(req, res) {
  const row = await db.one('UPDATE children SET rating_consent = $3 WHERE id = $1 AND parent_id = $2 RETURNING rating_consent',
    [id(req), req.user.id, v.bool((req.body || {}).consent)]);
  if (!row) throw new AppError('Ребёнок не найден', 404);
  res.json({ message: row.rating_consent ? 'Ребёнок будет показан в рейтинге на сайте' : 'Ребёнок скрыт из рейтинга на сайте' });
}

async function readNotifications(req, res) {
  await db.query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND NOT is_read', [req.user.id]);
  res.json({ message: 'Уведомления прочитаны' });
}

module.exports = {
  saveSlot, deleteSlot, generate, saveJournal, moveLesson, deleteHomework, uploadSickNote, reviewSickNote,
  addPayment, deletePayment, remind, enroll, finishEnrollment, enrollmentStatus, consent, readNotifications
};
