// Простая проверка входных данных форм и API
const { AppError } = require('./errors');
const dates = require('./dates');

const str = (v, { name, min = 0, max = 255, required = false } = {}) => {
  const s = (v === undefined || v === null) ? '' : String(v).trim();
  if (required && !s) throw new AppError(`Заполните поле «${name}»`);
  if (s && s.length < min) throw new AppError(`Поле «${name}»: минимум ${min} символов`);
  if (s.length > max) throw new AppError(`Поле «${name}»: максимум ${max} символов`);
  return s;
};
const email = (v) => {
  const s = str(v, { name: 'Электронная почта', required: true, max: 160 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) throw new AppError('Введите корректный адрес электронной почты');
  return s;
};
const phone = (v, required = true) => {
  const digits = String(v || '').replace(/\D/g, '');
  if (!digits && !required) return '';
  if (digits.length < 9 || digits.length > 15) throw new AppError('Введите номер телефона полностью');
  return '+' + (digits.length === 9 ? '375' + digits : digits);
};
const password = (v) => {
  const s = String(v || '');
  if (s.length < 8) throw new AppError('Пароль должен быть не короче 8 символов');
  if (!/[A-Za-zА-Яа-я]/.test(s) || !/\d/.test(s)) throw new AppError('Пароль должен содержать буквы и цифры');
  return s;
};
const int = (v, { name, min, max, required = true } = {}) => {
  if ((v === undefined || v === null || v === '') && !required) return null;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new AppError(`Поле «${name}»: нужно целое число`);
  if (min !== undefined && n < min) throw new AppError(`Поле «${name}»: не меньше ${min}`);
  if (max !== undefined && n > max) throw new AppError(`Поле «${name}»: не больше ${max}`);
  return n;
};
const num = (v, { name, min, required = true } = {}) => {
  if ((v === undefined || v === null || v === '') && !required) return null;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) throw new AppError(`Поле «${name}»: нужно число`);
  if (min !== undefined && n < min) throw new AppError(`Поле «${name}»: не меньше ${min}`);
  return Math.round(n * 100) / 100;
};
const date = (v, { name, required = true } = {}) => {
  if (!v && !required) return null;
  if (!dates.isDate(v)) throw new AppError(`Поле «${name}»: укажите дату`);
  return String(v).slice(0, 10);
};
const time = (v, { name } = {}) => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '').slice(0, 5))) throw new AppError(`Поле «${name}»: укажите время ЧЧ:ММ`);
  return String(v).slice(0, 5);
};
const oneOf = (v, list, name) => {
  if (!list.includes(v)) throw new AppError(`Поле «${name}»: недопустимое значение`);
  return v;
};
const bool = (v) => v === true || v === 'on' || v === 'true' || v === '1' || v === 1;
const lines = (v) => String(v || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

module.exports = { str, email, phone, password, int, num, date, time, oneOf, bool, lines };
