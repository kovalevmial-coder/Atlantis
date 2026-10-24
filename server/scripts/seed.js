// Тестовые данные: контент сайта берётся из js/data.js, учебный процесс (дети, посещаемость, оплаты) генерируется.
// Все дети, родители и второй учитель — вымышленные, для демонстрации работы системы.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const config = require('../config');
const { encrypt } = require('../utils/crypto');
const dates = require('../utils/dates');
const { chargeLesson } = require('../services/financeService');
const { generateLessons } = require('../services/scheduleService');

const PASSWORD = 'Atlantis2026';
const YEAR_START = '2026-09-01';
const YEAR_END = '2027-05-31';

// Повторяемый генератор случайных чисел, чтобы данные были одинаковыми при каждом запуске
let seedState = 20261024;
const rnd = () => { seedState = (seedState * 1103515245 + 12345) % 2147483648; return seedState / 2147483648; };
const pickOne = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));

function loadSiteData() {
  const code = fs.readFileSync(path.join(config.siteDir, 'js', 'data.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox);
  return sandbox.window.ATLANTIS;
}

// Метка, цвет и возраст для расписания по каждому продукту
const PRODUCT_META = {
  poznayka: ['ПОЗН', '#8E44AD', 3, 4],
  'podgotovka-2': ['ПШ-2', '#2E86C1', 4, 5],
  'podgotovka-1': ['ПШ-1', '#D35400', 5, 7],
  'klass-1': ['1 КЛ', '#27AE60', 6, 8],
  'klass-2': ['2 КЛ', '#16A085', 7, 9],
  'klass-3-4': ['3–4 КЛ', '#1F7A4D', 8, 11],
  'matematika-5-6': ['МАТ', '#C0392B', 10, 13],
  english: ['АНГЛ', '#3A547F', 6, 15],
  kalligrafiya: ['КАЛ', '#A84300', 6, 15],
  skorochtenie: ['СКОР', '#B7950B', 6, 11],
  videokurs: ['ВИДЕО', '#7F8C8D', 6, 15],
  'vspomnit-vse': ['МАРАФ', '#7F8C8D', 6, 13],
  umnozhenie: ['УМН', '#7F8C8D', 7, 12]
};
const DAY_NUM = { Пн: 1, Вт: 2, Ср: 3, Чт: 4, Пт: 5, Сб: 6, Вс: 7 };

const SURNAMES = [['Иванов', 'Иванова'], ['Ковальчук', 'Ковальчук'], ['Мельник', 'Мельник'], ['Новик', 'Новик'], ['Савчук', 'Савчук'], ['Кравченко', 'Кравченко'],
  ['Лукашевич', 'Лукашевич'], ['Петров', 'Петрова'], ['Сидоренко', 'Сидоренко'], ['Козлов', 'Козлова'], ['Гончаров', 'Гончарова'], ['Шевчук', 'Шевчук'],
  ['Романюк', 'Романюк'], ['Жук', 'Жук'], ['Бондаренко', 'Бондаренко'], ['Тарасевич', 'Тарасевич'], ['Климович', 'Климович'], ['Морозов', 'Морозова'],
  ['Волков', 'Волкова'], ['Соколов', 'Соколова'], ['Захаров', 'Захарова'], ['Яковлев', 'Яковлева'], ['Кузьмич', 'Кузьмич'], ['Дубовик', 'Дубовик']];
const BOYS = ['Артём', 'Максим', 'Матвей', 'Михаил', 'Даниил', 'Тимофей', 'Иван', 'Марк', 'Лев', 'Егор', 'Кирилл', 'Никита', 'Александр', 'Мирон'];
const GIRLS = ['Анна', 'София', 'Мария', 'Алиса', 'Ева', 'Варвара', 'Полина', 'Виктория', 'Дарья', 'Милана', 'Василиса', 'Злата', 'Ксения', 'Арина'];
const HOMEWORK = ['Прописи: стр. 12–13, две строки каждой буквы', 'Прочитать текст на стр. 24 и ответить на вопросы', 'Решить примеры № 3, 5, 7',
  'Повторить слова по теме урока', 'Задача на стр. 31, № 2 и № 4', 'Выучить правило и выполнить упражнение 45', 'Карточка с заданиями (во вложении у учителя)'];
const TOPICS = ['Повторение пройденного', 'Новая тема', 'Закрепление', 'Работа над ошибками', 'Самостоятельная работа', 'Игровое занятие'];

async function seed() {
  const D = loadSiteData();
  const q = db.query;
  const hash = await bcrypt.hash(PASSWORD, 10);

  // ---------- Контент сайта ----------
  const settings = [['name', 'Название центра'], ['subtitle', 'Подзаголовок'], ['city', 'Город'], ['address', 'Адрес'], ['district', 'Район'],
    ['phone', 'Телефон'], ['instagram', 'Ссылка на Instagram'], ['telegram', 'Ссылка на Telegram'], ['hours', 'Часы работы'], ['legal', 'Юридическая информация']];
  for (const [key, title] of settings) await q('INSERT INTO settings (key, title, value) VALUES ($1,$2,$3)', [key, title, D.center[key] || '']);

  let sort = 0;
  for (const c of D.categories.filter((x) => x.id !== 'all')) await q('INSERT INTO categories (id, title, sort) VALUES ($1,$2,$3)', [c.id, c.title, sort++]);

  const productId = {};
  sort = 0;
  for (const d of D.directions) {
    const [code, color, from, to] = PRODUCT_META[d.id] || [d.title.slice(0, 5).toUpperCase(), '#469E3E', null, null];
    const perCourse = /курс|марафон|тариф/i.test(d.priceUnit) && d.category !== 'online';
    const row = await db.one(
      `INSERT INTO products (slug, title, code, color, category_id, short, program, for_whom, age_label, age_from, age_to, duration_min, duration_label,
                             group_label, price, price_label, price_unit, link, is_online, featured, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,60,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`,
      [d.id, d.title, code, color, d.category, d.short, d.program || [], d.forWhom || [], d.age, from, to, d.duration, d.group,
        perCourse ? Math.round(d.price / 8 * 100) / 100 : d.price, d.price, d.priceUnit, d.link ? '/' + d.link : null,
        d.category === 'online', Boolean(d.featured), sort++]);
    productId[d.id] = row.id;
  }
  sort = 0;
  for (const p of D.prices) await q('INSERT INTO price_cards (title, value, unit, note, items, featured, sort) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [p.title, p.value, p.unit, p.note, p.items, Boolean(p.featured), sort++]);
  sort = 0;
  for (const r of D.reviews) await q('INSERT INTO reviews (text, author, about, source, sort) VALUES ($1,$2,$3,$4,$5)', [r.text, r.author, r.about, r.source, sort++]);
  sort = 0;
  for (const f of D.faq) await q('INSERT INTO faq (q, a, sort) VALUES ($1,$2,$3)', [f.q, f.a, sort++]);

  // ---------- Точка, кабинеты, льготы ----------
  const branch = await db.one('INSERT INTO branches (name, address, phone, hours) VALUES ($1,$2,$3,$4) RETURNING id',
    ['Атлантис на Кривошеина', D.center.address, D.center.phone, D.center.hours]);
  const roomId = {};
  for (const name of ['Кабинет 1', 'Кабинет 2']) roomId[name] = (await db.one('INSERT INTO rooms (branch_id, name, capacity) VALUES ($1,$2,10) RETURNING id', [branch.id, name])).id;
  const benefits = [];
  for (const [title, pct] of [['Многодетная семья', 20], ['Второй ребёнок в семье', 10]]) {
    benefits.push((await db.one('INSERT INTO benefits (title, discount_pct) VALUES ($1,$2) RETURNING id', [title, pct])).id);
  }

  // ---------- Сотрудники ----------
  const user = async (email, role, fullName, phone, extra = {}) => (await db.one(
    `INSERT INTO users (email, password_hash, role, full_name, phone_enc, email_verified, last_login_at) VALUES ($1,$2,$3,$4,$5,TRUE,$6) RETURNING id`,
    [email, hash, role, fullName, encrypt(phone), extra.lastLogin || null])).id;
  const director = await user('director@atlantis.by', 'DIRECTOR', 'Ковалёва Анна Александровна', D.center.phone);
  await q(`INSERT INTO teacher_profiles (user_id, slug, position, lead, education, experience_years, achievements, motto, photo_url, sort)
           VALUES ($1,'kovaleva-anna',$2,$3,$4,20,$5,$6,'/img/pedagog-portret.jpg',0)`,
    [director, D.teacher.role, 'Ведёт подготовку к школе, помощь школьникам 1–6 классов, каллиграфию и скорочтение.', D.teacher.education,
      ['20 лет работы с детьми дошкольного и школьного возраста', 'Автор курса «Каллиграфия и исправление почерка» (очно и онлайн)', 'Автор курса скорочтения для 1–4 классов',
        'Основатель развивающего центра «Атлантис»'], D.teacher.motto]);
  const teacher = await user('teacher@atlantis.by', 'TEACHER', 'Литвинович Ольга Сергеевна', '+375 29 111-22-33');
  await q(`INSERT INTO teacher_profiles (user_id, slug, position, lead, education, experience_years, achievements, motto, show_on_site, sort)
           VALUES ($1,'litvinovich-olga','Учитель английского языка и математики (демо)',$2,'Демонстрационная учётная запись',8,$3,$4,TRUE,1)`,
    [teacher, 'Тестовый учитель для проверки кабинета: ведёт английский язык и математику 5–6 класса.', ['Пример регалии: категория, курсы, олимпиады учеников'], 'Учиться интересно, когда понятно.']);
  for (const t of [director, teacher]) await q('INSERT INTO teacher_branches (user_id, branch_id) VALUES ($1,$2)', [t, branch.id]);
  const teacherOf = (slug) => (['english', 'matematika-5-6'].includes(slug) ? teacher : director);

  // ---------- Группы и расписание (из расписания сайта) ----------
  const bySlug = {};
  for (const s of D.schedule) (bySlug[s.dir] = bySlug[s.dir] || []).push(s);
  const groups = [];
  for (const [slug, slots] of Object.entries(bySlug)) {
    const dir = D.directions.find((d) => d.id === slug);
    const days = slots.map((s) => s.day).join('/');
    const times = [...new Set(slots.map((s) => s.time))].join(', ');
    const isCourse = slug === 'kalligrafiya';
    const variants = isCourse ? [['2026-10-06', '2026-10-30', 'октябрь'], ['2026-11-03', '2026-11-27', 'ноябрь']] : [[YEAR_START, YEAR_END, null]];
    for (const [start, end, label] of variants) {
      const g = await db.one(
        `INSERT INTO groups (title, product_id, branch_id, teacher_id, capacity, start_date, end_date) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [`${dir.title}${label ? ` (${label})` : ''}, ${days} ${times}`, productId[slug], branch.id, teacherOf(slug), slots[0].total, start, end]);
      for (const s of slots) {
        const [h, m] = s.time.split(':').map(Number);
        const endTime = `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        await q('INSERT INTO schedule_slots (group_id, weekday, start_time, end_time, room_id) VALUES ($1,$2,$3,$4,$5)', [g.id, DAY_NUM[s.day], s.time, endTime, roomId[s.room]]);
      }
      groups.push({ id: g.id, slug, start, taken: label === 'ноябрь' ? 2 : slots[0].taken, meta: PRODUCT_META[slug], teacher: teacherOf(slug) });
    }
  }

  // ---------- Родители и дети ----------
  const today = dates.today();
  const birthFor = (ageFrom, ageTo) => {
    const age = between(ageFrom, ageTo);
    return dates.addDays(`${Number(today.slice(0, 4)) - age}-01-01`, -between(30, 330));
  };
  const gradeFor = (birth) => {
    const age = Math.floor((dates.parse(YEAR_START) - dates.parse(birth)) / (365.25 * 864e5));
    return age >= 6 && age <= 15 ? `${age - 5} класс` : null;
  };
  const child = async ({ name, parentId, birth, benefit = null, consent = rnd() < 0.75 }) => (await db.one(
    `INSERT INTO children (parent_id, full_name, birth_date_enc, grade, benefit_id, rating_consent) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [parentId, name, encrypt(birth), gradeFor(birth), benefit, consent])).id;

  // Демо-родитель с двумя детьми и ещё один родитель
  const parent = await user('parent@atlantis.by', 'PARENT', 'Савчук Елена Викторовна', '+375 33 222-33-44');
  const parent2 = await user('parent2@atlantis.by', 'PARENT', 'Морозов Андрей Павлович', '+375 44 333-44-55');
  const enrollments = [];
  const g = (slug, n = 0) => groups.filter((x) => x.slug === slug)[n];
  const sofia = await child({ name: 'Савчук София', parentId: parent, birth: '2019-10-14', benefit: benefits[1], consent: true });
  const mark = await child({ name: 'Савчук Марк', parentId: parent, birth: '2021-06-02', consent: false });
  const vika = await child({ name: 'Морозова Виктория', parentId: parent2, birth: '2018-11-20', consent: true });
  enrollments.push([sofia, g('klass-1').id, YEAR_START], [sofia, g('kalligrafiya').id, '2026-10-06'], [sofia, g('english').id, YEAR_START],
    [mark, g('podgotovka-2').id, YEAR_START], [vika, g('klass-2').id, YEAR_START], [vika, g('skorochtenie').id, YEAR_START]);

  // Остальные места в группах занимают дети без кабинета родителя или с отдельными родителями
  let parentNo = 3;
  for (const grp of groups) {
    const already = enrollments.filter((e) => e[1] === grp.id).length;
    for (let i = already; i < grp.taken; i += 1) {
      const girl = rnd() < 0.5;
      const sur = pickOne(SURNAMES);
      const name = `${girl ? sur[1] : sur[0]} ${pickOne(girl ? GIRLS : BOYS)}`;
      let parentId = null;
      if (rnd() < 0.35) {
        const pg = rnd() < 0.8;
        parentId = await user(`parent${parentNo}@atlantis.by`, 'PARENT', `${pg ? sur[1] : sur[0]} ${pickOne(pg ? ['Ольга', 'Татьяна', 'Наталья', 'Ирина', 'Светлана'] : ['Сергей', 'Дмитрий', 'Андрей'])}`,
          `+375 29 ${between(100, 999)}-${between(10, 99)}-${between(10, 99)}`);
        parentNo += 1;
      }
      const cid = await child({ name, parentId, birth: birthFor(grp.meta[2], grp.meta[3]), benefit: rnd() < 0.12 ? pickOne(benefits) : null });
      enrollments.push([cid, grp.id, grp.start]);
    }
  }
  for (const [cid, gid, start] of enrollments) {
    const status = gid === g('english').id && cid === sofia ? 'trial' : 'active';
    await q('INSERT INTO enrollments (child_id, group_id, status, start_date) VALUES ($1,$2,$3,$4)', [cid, gid, status, start]);
  }
  // Лист ожидания в полной группе 2 класса
  const waitKid = await child({ name: 'Климович Злата', parentId: null, birth: '2018-08-09' });
  await q(`INSERT INTO enrollments (child_id, group_id, status, start_date, created_at) VALUES ($1,$2,'waiting',$3, now())`, [waitKid, g('klass-2').id, today]);

  // ---------- Занятия, посещаемость, баллы, домашние задания ----------
  await generateLessons(YEAR_START, dates.addDays(today, 7 * 8));
  const past = await q(
    `SELECT l.id, l.group_id, to_char(l.lesson_date,'YYYY-MM-DD') AS date, g.teacher_id FROM lessons l JOIN groups g ON g.id = l.group_id
      WHERE l.lesson_date < $1 ORDER BY l.lesson_date, l.start_time`, [dates.addDays(today, -1)]);
  for (const l of past) {
    const kids = await q(`SELECT child_id FROM enrollments WHERE group_id = $1 AND status IN ('active','trial') AND start_date <= $2`, [l.group_id, l.date]);
    for (const k of kids) {
      const r = rnd();
      const status = r < 0.84 ? 'present' : r < 0.92 ? 'absent' : r < 0.98 ? 'sick' : 'excused';
      const points = status === 'present' ? between(4, 10) : null;
      await q('INSERT INTO attendance (lesson_id, child_id, status, points, marked_by, marked_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [l.id, k.child_id, status, points, l.teacher_id, `${l.date} 19:00`]);
      if (status === 'sick') {
        await q(`INSERT INTO sick_notes (child_id, date_from, date_to, status, uploaded_by, reviewed_by, created_at) VALUES ($1,$2,$3,'accepted',$4,$4,$5)`,
          [k.child_id, l.date, l.date, l.teacher_id, `${l.date} 20:00`]);
      }
    }
    await q(`UPDATE lessons SET status = 'done', topic = $2 WHERE id = $1`, [l.id, pickOne(TOPICS)]);
    if (rnd() < 0.6) {
      await q('INSERT INTO homework (lesson_id, text, due_date, created_by, created_at) VALUES ($1,$2,$3,$4,$5)',
        [l.id, pickOne(HOMEWORK), dates.addDays(l.date, between(2, 4)), l.teacher_id, `${l.date} 19:05`]);
    }
    await chargeLesson(l.id);
  }

  // Справка от родителя ждёт проверки
  await q(`INSERT INTO sick_notes (child_id, date_from, date_to, status, comment, uploaded_by) VALUES ($1,$2,$3,'pending','ОРВИ, справка из поликлиники',$4)`,
    [vika, dates.addDays(today, -3), dates.addDays(today, -1), parent2]);

  // ---------- Оплаты: сентябрь оплатили все, октябрь — большинство ----------
  const kidsCharges = await q(
    `SELECT ch.child_id, to_char(l.lesson_date,'YYYY-MM') AS month, sum(ch.amount) AS s, min(l.group_id) AS group_id
       FROM charges ch JOIN lessons l ON l.id = ch.lesson_id GROUP BY ch.child_id, month ORDER BY ch.child_id, month`);
  for (const c of kidsCharges) {
    const isOct = c.month === '2026-10';
    if (isOct && rnd() < 0.3 && c.child_id !== sofia) continue;            // часть родителей ещё не оплатила
    const amount = isOct ? Math.ceil(c.s / 25) * 25 + (rnd() < 0.3 ? 50 : 0) : c.s;
    const grp = groups.find((x) => x.id === c.group_id);
    await q('INSERT INTO payments (child_id, group_id, amount, paid_at, method, branch_id, received_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [c.child_id, c.group_id, amount, `${c.month}-0${between(2, 8)}`, pickOne(['cash', 'cash', 'card', 'erip']), branch.id, grp ? grp.teacher : director]);
  }

  // ---------- Заявки и уведомления ----------
  const reqs = [['Наталья', '+375 29 555-12-34', '5 лет', 'podgotovka-1', 'new'], ['Игорь', '+375 33 777-45-12', '2 класс', 'kalligrafiya', 'new'],
    ['Марина', '+375 44 123-98-76', '7 лет', null, 'in_work']];
  for (const [n, ph, age, slug, st] of reqs) {
    await q('INSERT INTO requests (parent_name, phone_enc, child_age, product_id, status) VALUES ($1,$2,$3,$4,$5)', [n, encrypt(ph), age, slug ? productId[slug] : null, st]);
  }
  for (const [uid, text] of [[parent, 'Добро пожаловать в личный кабинет «Атлантис»!'], [parent, 'Новое домашнее задание по группе «Помощь школьнику, 1 класс».'],
    [parent2, 'Справка за Морозова Виктория отправлена на проверку.'], [director, 'Новая заявка с сайта: Наталья, «Подготовка к школе за год».']]) {
    await q('INSERT INTO notifications (user_id, text) VALUES ($1,$2)', [uid, text]);
  }
}

module.exports = seed;
