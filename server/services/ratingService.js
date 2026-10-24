// Бизнес-операция 10: рейтинг учеников и топ-10 для сайта
const db = require('../config/db');
const dates = require('../utils/dates');

const shortName = (full) => {
  // «Иванова Анна Сергеевна» → «Анна И.»; на сайт фамилия полностью не выводится
  const parts = String(full).trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[1]} ${parts[0][0]}.`;
};

// Рейтинг за месяц: сумма баллов, при равенстве выше тот, кто чаще ходил
async function ranking({ month, productId = null, groupId = null, publicOnly = false, limit = null }) {
  const from = dates.monthStart(month || dates.today());
  const rows = await db.query(
    `SELECT c.id, c.full_name, c.rating_consent, p.id AS product_id, p.title AS product,
            COALESCE(sum(a.points), 0) AS points, count(*) FILTER (WHERE a.status = 'present') AS visits
       FROM attendance a JOIN lessons l ON l.id = a.lesson_id JOIN groups g ON g.id = l.group_id JOIN products p ON p.id = g.product_id
       JOIN children c ON c.id = a.child_id
      WHERE l.lesson_date BETWEEN $1 AND $2 AND c.is_active
        AND ($3::int IS NULL OR p.id = $3) AND ($4::int IS NULL OR g.id = $4)
      GROUP BY c.id, p.id
      HAVING COALESCE(sum(a.points), 0) > 0
      ORDER BY p.title, points DESC, visits DESC, c.full_name`, [from, dates.monthEnd(from), productId, groupId]);
  // Место считаем внутри продукта
  const byProduct = new Map();
  for (const r of rows) {
    const list = byProduct.get(r.product_id) || [];
    r.place = list.length + 1;
    list.push(r);
    byProduct.set(r.product_id, list);
  }
  let result = [...byProduct.values()].map((list) => {
    let items = list;
    if (publicOnly) items = items.filter((r) => r.rating_consent).map((r) => ({ place: r.place, name: shortName(r.full_name), points: r.points, visits: r.visits }));
    if (limit) items = items.slice(0, limit);
    return { productId: list[0].product_id, product: list[0].product, items };
  });
  if (publicOnly) result = result.filter((p) => p.items.length);
  return { month: from.slice(0, 7), products: result };
}

async function childRating(childId, month) {
  const all = await ranking({ month });
  const out = [];
  for (const p of all.products) {
    const me = p.items.find((r) => r.id === childId);
    if (me) out.push({ product: p.product, place: me.place, of: p.items.length, points: me.points, visits: me.visits });
  }
  return out;
}

module.exports = { shortName, ranking, childRating };
