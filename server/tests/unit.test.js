// Модульные тесты функций без базы данных: проверка ввода, даты, шифрование, рейтинг
const test = require('node:test');
const assert = require('node:assert');
process.env.ENC_KEY = process.env.ENC_KEY || 'a'.repeat(64);
const v = require('../utils/validate');
const dates = require('../utils/dates');
const { encrypt, decrypt, tempPassword } = require('../utils/crypto');
const { shortName } = require('../services/ratingService');
const { ageOf } = require('../services/enrollmentService');

test('телефон приводится к формату +375', () => {
  assert.strictEqual(v.phone('29 672-28-33'), '+375296722833');
  assert.strictEqual(v.phone('+375 (33) 222-33-44'), '+375332223344');
  assert.throws(() => v.phone('123'));
});

test('пароль: не короче 8 символов, буквы и цифры', () => {
  assert.throws(() => v.password('abc123'));
  assert.throws(() => v.password('abcdefgh'));
  assert.strictEqual(v.password('abc12345'), 'abc12345');
});

test('даты: понедельник недели, конец месяца, день недели', () => {
  assert.strictEqual(dates.monday('2026-10-24'), '2026-10-19');
  assert.strictEqual(dates.monthEnd('2026-02-10'), '2026-02-28');
  assert.strictEqual(dates.weekday('2026-10-25'), 7);
});

test('шифрование персональных данных обратимо и каждый раз даёт новый шифртекст', () => {
  const a = encrypt('+375296722833');
  const b = encrypt('+375296722833');
  assert.notStrictEqual(a, b);
  assert.strictEqual(decrypt(a), '+375296722833');
  assert.strictEqual(decrypt('испорченные.данные.x'), '');
});

test('временный пароль из 10 символов без похожих букв', () => {
  const p = tempPassword();
  assert.strictEqual(p.length, 10);
  assert.ok(!/[0O1lI]/.test(p));
});

test('на сайте показывается имя и первая буква фамилии', () => {
  assert.strictEqual(shortName('Савчук София'), 'София С.');
});

test('возраст считается с учётом дня рождения', () => {
  assert.strictEqual(ageOf('2019-10-14', '2026-10-13'), 6);
  assert.strictEqual(ageOf('2019-10-14', '2026-10-14'), 7);
});
