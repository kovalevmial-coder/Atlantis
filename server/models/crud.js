// Модель конструктора: чтение и запись сущностей по описанию из entities.js
const db = require('../config/db');
const ENTITIES = require('./entities');
const { AppError } = require('../utils/errors');
const v = require('../utils/validate');
const { saveFile } = require('../services/common');

function entity(name) {
  const e = ENTITIES[name];
  if (!e) throw new AppError('Раздел конструктора не найден', 404);
  return e;
}

// Значения для выпадающих списков
async function refs(e) {
  const out = {};
  for (const f of e.fields.filter((x) => x.type === 'select')) {
    const key = f.ref.key || 'id';
    out[f.name] = await db.query(`SELECT ${key} AS value, ${f.ref.label} AS label FROM ${f.ref.table} ORDER BY ${f.ref.label}`);
  }
  return out;
}

async function list(name, branchId = null) {
  const e = entity(name);
  const where = e.branchField && branchId ? `WHERE ${e.branchField} = $1` : '';
  return db.query(`SELECT * FROM ${e.table} ${where} ORDER BY ${e.order}`, where ? [branchId] : []);
}

async function get(name, id) {
  const e = entity(name);
  const row = await db.one(`SELECT * FROM ${e.table} WHERE id = $1`, [id]);
  if (!row) throw new AppError('Запись не найдена', 404);
  return row;
}

// Преобразование и проверка значений формы
async function parse(e, body, file) {
  const out = {};
  for (const f of e.fields) {
    let raw = body[f.name];
    // Пустое поле получает значение по умолчанию из описания сущности
    if ((raw === undefined || raw === '') && f.default !== undefined && f.type !== 'bool') raw = f.default;
    const opts = { name: f.label, required: Boolean(f.required), min: f.min, max: f.max };
    switch (f.type) {
      case 'bool': out[f.name] = v.bool(raw); break;
      case 'int': out[f.name] = v.int(raw, opts); break;
      case 'money': {
        const n = v.num(raw, opts);
        if (n !== null && f.max !== undefined && n > f.max) throw new AppError(`Поле «${f.label}»: не больше ${f.max}`);
        out[f.name] = n; break;
      }
      case 'lines': out[f.name] = v.lines(raw); break;
      case 'color': out[f.name] = /^#[0-9a-f]{6}$/i.test(raw || '') ? raw : (f.default || '#469E3E'); break;
      case 'slug': {
        const s = v.str(raw, opts).toLowerCase();
        if (s && !/^[a-z0-9-]+$/.test(s)) throw new AppError(`Поле «${f.label}»: только латиница, цифры и дефис`);
        out[f.name] = s; break;
      }
      case 'select': out[f.name] = raw === '' || raw === undefined ? null : (f.ref.key ? String(raw) : Number(raw));
        if (f.required && out[f.name] === null) throw new AppError(`Заполните поле «${f.label}»`); break;
      case 'image':
        if (file) out[f.name] = await saveFile(file);
        else if (v.bool(body[`${f.name}__remove`])) out[f.name] = null;
        break;
      default: out[f.name] = v.str(raw, { ...opts, max: f.max || (f.type === 'textarea' ? 2000 : 255) }) || null;
    }
    if (f.required && (out[f.name] === null || out[f.name] === '')) throw new AppError(`Заполните поле «${f.label}»`);
  }
  return out;
}

async function save(name, id, body, file) {
  const e = entity(name);
  const data = await parse(e, body, file);
  const cols = Object.keys(data);
  if (id !== null && id !== undefined && id !== '') {
    const sets = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
    const row = await db.one(`UPDATE ${e.table} SET ${sets} WHERE id = $1 RETURNING id`, [id, ...cols.map((c) => data[c])]);
    if (!row) throw new AppError('Запись не найдена', 404);
    return row.id;
  }
  const row = await db.one(`INSERT INTO ${e.table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, cols.map((c) => data[c]));
  return row.id;
}

async function remove(name, id) {
  const e = entity(name);
  await db.query(`DELETE FROM ${e.table} WHERE id = $1`, [id]);
}

module.exports = { ENTITIES, entity, refs, list, get, save, remove };
