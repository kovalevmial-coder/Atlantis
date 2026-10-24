// Маршруты приложения: публичные страницы, кабинеты по ролям и REST API
const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');
const pub = require('../controllers/publicController');
const authC = require('../controllers/authController');
const api = require('../controllers/apiController');
const cab = require('../controllers/cabinetController');
const staff = require('../controllers/staffController');
const admin = require('../controllers/adminController');

const router = express.Router();
const STAFF = requireRole('TEACHER', 'DIRECTOR');
const TEACHER = requireRole('TEACHER');
const DIRECTOR = requireRole('DIRECTOR');
const PARENT = requireRole('PARENT');

// Ограничение частоты запросов к входу, регистрации и заявкам (защита от подбора и спама)
const limiter = (max) => rateLimit({ windowMs: 15 * 60 * 1000, limit: max, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Слишком много запросов, попробуйте через 15 минут' } });

// ---------- Публичный сайт ----------
router.get('/js/data.js', pub.dataJs);
router.get(['/', '/index.html'], pub.home);
router.get('/napravleniya.html', pub.page('napravleniya'));
router.get('/kalligrafiya.html', pub.page('kalligrafiya'));
router.get('/ceny.html', pub.page('ceny'));
router.get('/kontakty.html', pub.page('kontakty'));
router.get('/raspisanie.html', pub.page('raspisanie'));
router.get('/pedagog.html', pub.teachers);
router.get('/pedagog/:slug', pub.teacher);
router.get('/reyting.html', pub.ratingPage);
router.get('/vhod.html', (req, res) => res.redirect(301, '/vhod'));
router.get('/kabinet.html', (req, res) => res.redirect(301, '/kabinet'));
router.get('/files/:id', pub.file);

router.post('/api/requests', limiter(20), pub.createRequest);
router.get('/api/schedule/catalog', pub.catalog);
router.get('/api/schedule/week', pub.week);
router.get('/api/suggest', pub.suggest);

// ---------- Вход и пароль ----------
router.get('/vhod', authC.loginPage);
router.post('/vyhod', authC.logout);
router.get('/parol', requireAuth, authC.passwordPage);
router.use('/api/auth', limiter(50));
router.post('/api/auth/login', authC.login);
router.post('/api/auth/register', authC.register);
router.post('/api/auth/verify', authC.verify);
router.post('/api/auth/resend', authC.resend);
router.post('/api/auth/forgot', authC.forgot);
router.post('/api/auth/reset', authC.reset);
router.post('/api/auth/password', requireAuth, authC.changePassword);

// ---------- Кабинет родителя ----------
router.get('/kabinet', PARENT, cab.home);
router.get('/kabinet/raspisanie', PARENT, cab.raspisanie);
router.get('/kabinet/poseshchaemost', PARENT, cab.poseshchaemost);
router.get('/kabinet/oplaty', PARENT, cab.oplaty);
router.get('/kabinet/domashka', PARENT, cab.domashka);
router.get('/kabinet/reyting', PARENT, cab.reyting);
router.get('/kabinet/spravki', PARENT, cab.spravki);
router.get('/kabinet/profil', PARENT, cab.profil);

// ---------- Кабинет учителя ----------
router.get('/uchitel', TEACHER, staff.home);
router.get('/uchitel/raspisanie', TEACHER, staff.raspisanie);
router.get('/uchitel/zhurnal/:id', TEACHER, staff.zhurnal);
router.get('/uchitel/gruppy', TEACHER, staff.gruppy);
router.get('/uchitel/gruppy/:id', TEACHER, staff.gruppa);
router.get('/uchitel/oplaty', TEACHER, staff.oplaty);
router.get('/uchitel/spravki', TEACHER, staff.spravki);
router.get('/uchitel/reyting', TEACHER, staff.reyting);
router.get('/uchitel/otchety', TEACHER, staff.otchety);
router.get('/uchitel/otchety.xlsx', TEACHER, staff.otchetyXlsx);
router.get('/uchitel/profil', TEACHER, cab.profil);

// ---------- Панель директора ----------
router.get('/direktor', DIRECTOR, admin.home);
router.get('/direktor/raspisanie', DIRECTOR, staff.raspisanie);
router.get('/direktor/zhurnal/:id', DIRECTOR, staff.zhurnal);
router.get('/direktor/gruppy', DIRECTOR, staff.gruppy);
router.get('/direktor/gruppy/new', DIRECTOR, admin.gruppaForm);
router.get('/direktor/gruppy/:id/edit', DIRECTOR, admin.gruppaForm);
router.get('/direktor/gruppy/:id', DIRECTOR, staff.gruppa);
router.get('/direktor/ucheniki', DIRECTOR, admin.ucheniki);
router.get('/direktor/ucheniki/new', DIRECTOR, admin.uchenikForm);
router.get('/direktor/ucheniki/:id', DIRECTOR, admin.uchenikForm);
router.get('/direktor/uchitelya', DIRECTOR, admin.uchitelya);
router.get('/direktor/uchitelya/new', DIRECTOR, admin.uchitelForm);
router.get('/direktor/uchitelya/:id', DIRECTOR, admin.uchitelForm);
router.get('/direktor/zayavki', DIRECTOR, admin.zayavki);
router.get('/direktor/oplaty', DIRECTOR, staff.oplaty);
router.get('/direktor/spravki', DIRECTOR, staff.spravki);
router.get('/direktor/reyting', DIRECTOR, staff.reyting);
router.get('/direktor/otchety', DIRECTOR, staff.otchety);
router.get('/direktor/otchety.xlsx', DIRECTOR, staff.otchetyXlsx);
router.get('/direktor/konstruktor', DIRECTOR, admin.konstruktor);
router.get('/direktor/konstruktor/:entity', DIRECTOR, admin.entityList);
router.get('/direktor/konstruktor/:entity/new', DIRECTOR, admin.entityForm);
router.get('/direktor/konstruktor/:entity/:id', DIRECTOR, admin.entityForm);
router.get('/direktor/nastroiki', DIRECTOR, admin.nastroiki);
router.get('/direktor/polzovateli', DIRECTOR, admin.polzovateli);
router.get('/direktor/kopii', DIRECTOR, admin.kopii);
router.get('/direktor/kopii/:file', DIRECTOR, admin.downloadBackup);
router.get('/direktor/profil', DIRECTOR, cab.profil);

// ---------- API рабочих операций ----------
router.post('/api/slots', STAFF, api.saveSlot);
router.delete('/api/slots/:id', STAFF, api.deleteSlot);
router.post('/api/lessons/generate', DIRECTOR, api.generate);
router.post('/api/lessons/:id/journal', STAFF, upload.single('file'), api.saveJournal);
router.post('/api/lessons/:id/move', STAFF, api.moveLesson);
router.delete('/api/homework/:id', STAFF, api.deleteHomework);
router.post('/api/sick-notes', requireAuth, upload.single('file'), api.uploadSickNote);
router.post('/api/sick-notes/:id/accept', STAFF, api.reviewSickNote(true));
router.post('/api/sick-notes/:id/reject', STAFF, api.reviewSickNote(false));
router.post('/api/payments', STAFF, api.addPayment);
router.post('/api/payments/remind', STAFF, api.remind);
router.delete('/api/payments/:id', DIRECTOR, api.deletePayment);
router.post('/api/enrollments', DIRECTOR, api.enroll);
router.post('/api/enrollments/:id/finish', DIRECTOR, api.finishEnrollment);
router.post('/api/enrollments/:id/status', DIRECTOR, api.enrollmentStatus);
router.post('/api/children/:id/consent', PARENT, api.consent);
router.post('/api/notifications/read', requireAuth, api.readNotifications);

// ---------- API панели директора ----------
router.post('/api/admin/teachers', DIRECTOR, upload.single('file'), admin.saveTeacher);
router.post('/api/admin/teachers/:id', DIRECTOR, upload.single('file'), admin.saveTeacher);
router.post('/api/admin/children', DIRECTOR, admin.saveChild);
router.post('/api/admin/children/:id', DIRECTOR, admin.saveChild);
router.post('/api/admin/groups', DIRECTOR, admin.saveGroup);
router.post('/api/admin/groups/:id', DIRECTOR, admin.saveGroup);
router.post('/api/admin/requests/:id', DIRECTOR, admin.updateRequest);
router.post('/api/admin/users/:id/reset', DIRECTOR, admin.resetUser);
router.post('/api/admin/users/:id/active', DIRECTOR, admin.setActive);
router.post('/api/admin/directors', DIRECTOR, admin.createDirector);
router.post('/api/admin/settings', DIRECTOR, admin.saveSettings);
router.post('/api/admin/backups', DIRECTOR, admin.createBackup);
router.post('/api/admin/backups/:file/restore', DIRECTOR, admin.restoreBackup);
router.post('/api/admin/:entity', DIRECTOR, upload.single('file'), admin.entitySave);
router.post('/api/admin/:entity/:id', DIRECTOR, upload.single('file'), admin.entitySave);
router.delete('/api/admin/:entity/:id', DIRECTOR, admin.entityDelete);

module.exports = router;
