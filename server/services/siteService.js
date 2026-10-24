// Данные публичного сайта из БД (то, что раньше было заглушкой в js/data.js)
const db = require('../config/db');

const DAY = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

async function settings() {
  const rows = await db.query('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

const photoUrl = (t) => (t.photo_id ? `/files/${t.photo_id}` : t.photo_url || '/img/pedagog-portret.jpg');

async function teachers() {
  const rows = await db.query(
    `SELECT u.id, u.full_name, tp.slug, tp.position, tp.lead, tp.education, tp.experience_years, tp.achievements, tp.motto, tp.photo_id, tp.photo_url,
            (SELECT array_agg(DISTINCT p.title) FROM groups g JOIN products p ON p.id = g.product_id WHERE g.teacher_id = u.id AND g.is_active) AS products
       FROM teacher_profiles tp JOIN users u ON u.id = tp.user_id
      WHERE tp.show_on_site AND u.is_active ORDER BY tp.sort, u.full_name`);
  return rows.map((t) => ({ ...t, photo: photoUrl(t), products: t.products || [] }));
}

async function teacherBySlug(slug) {
  const list = await teachers();
  return list.find((t) => t.slug === slug) || null;
}

// Структура window.ATLANTIS для клиентских скриптов сайта
async function bundle() {
  const [s, categories, products, slots, prices, reviews, faq, teacherList] = await Promise.all([
    settings(),
    db.query('SELECT id, title FROM categories ORDER BY sort'),
    db.query(`SELECT p.*, f.id AS file FROM products p LEFT JOIN files f ON f.id = p.image_id WHERE p.is_active AND p.show_on_site ORDER BY p.sort, p.title`),
    db.query(`SELECT s.weekday, to_char(s.start_time,'HH24:MI') AS time, p.slug, r.name AS room, g.capacity, g.id AS group_id,
                     (SELECT count(*) FROM enrollments e WHERE e.group_id = g.id AND e.status IN ('active','trial')) AS taken
                FROM schedule_slots s JOIN groups g ON g.id = s.group_id JOIN products p ON p.id = g.product_id JOIN rooms r ON r.id = s.room_id
               WHERE g.is_active AND g.end_date >= CURRENT_DATE ORDER BY s.weekday, s.start_time`),
    db.query('SELECT title, value, unit, note, items, featured FROM price_cards ORDER BY sort, id'),
    db.query('SELECT text, author, about, source FROM reviews ORDER BY sort, id'),
    db.query('SELECT q, a FROM faq ORDER BY sort, id'),
    teachers()
  ]);
  const main = teacherList[0] || {};
  const daysOf = (slug) => [...new Set(slots.filter((x) => x.slug === slug).map((x) => DAY[x.weekday]))].join(', ');
  const directions = products.map((p) => ({
    id: p.slug, title: p.title, category: p.category_id, age: p.age_label || '', duration: p.duration_label || `${p.duration_min} мин`,
    group: p.group_label || '', days: daysOf(p.slug) || (p.is_online ? 'в своём темпе' : 'по расписанию'),
    price: p.price_label ?? p.price, priceUnit: p.price_unit, short: p.short || '', program: p.program,
    forWhom: p.for_whom.length ? p.for_whom : undefined, featured: p.featured || undefined, link: p.link || undefined,
    image: p.file ? `/files/${p.file}` : undefined
  }));
  const phoneDigits = (s.phone || '').replace(/[^\d+]/g, '');
  return {
    center: { name: s.name, subtitle: s.subtitle, city: s.city, address: s.address, district: s.district, phone: s.phone,
      phoneHref: `tel:${phoneDigits}`, instagram: s.instagram, telegram: s.telegram || '#', hours: s.hours, legal: s.legal },
    teacher: { name: main.full_name, role: main.position, experience: main.experience_years ? `${main.experience_years} лет` : '', education: main.education, motto: main.motto },
    categories: [{ id: 'all', title: 'Все' }, ...categories],
    directions,
    homeDirections: directions.filter((d) => d.featured).map((d) => d.id).concat(directions.map((d) => d.id)).filter((v, i, a) => a.indexOf(v) === i).slice(0, 6),
    schedule: slots.map((x) => ({ day: DAY[x.weekday], time: x.time, dir: x.slug, room: x.room, total: x.capacity, taken: x.taken, groupId: x.group_id })),
    prices: prices.map((p) => ({ ...p, items: p.items })),
    reviews, faq,
    server: true
  };
}

module.exports = { settings, teachers, teacherBySlug, bundle, photoUrl };
