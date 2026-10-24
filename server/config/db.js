// Подключение к PostgreSQL через пул соединений
const { Pool, types } = require('pg');
const config = require('./index');

// DATE отдаём строкой 'YYYY-MM-DD' без перевода в часовой пояс, NUMERIC — числом
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
types.setTypeParser(20, (v) => Number(v));

const pool = new Pool(config.db);

// Выполнить запрос; возвращает массив строк
async function query(text, params) {
  const res = await pool.query(text, params);
  return res.rows;
}

async function one(text, params) {
  const rows = await query(text, params);
  return rows[0] || null;
}

// Выполнить функцию в транзакции: fn получает клиент с методами query/one
async function tx(fn) {
  const client = await pool.connect();
  const api = {
    query: async (t, p) => (await client.query(t, p)).rows,
    one: async (t, p) => (await client.query(t, p)).rows[0] || null
  };
  try {
    await client.query('BEGIN');
    const result = await fn(api);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, one, tx };
