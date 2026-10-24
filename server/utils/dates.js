// Работа с датами без часовых поясов: даты хранятся как 'YYYY-MM-DD'
const DAY_NAMES = ['', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const DAY_SHORT = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => toISO(new Date());
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return toISO(d); };
const weekday = (s) => { const w = parse(s).getDay(); return w === 0 ? 7 : w; };   // 1 = Пн
const monday = (s) => addDays(s, 1 - weekday(s));
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(parse(s).getTime());
const human = (s) => { const d = parse(s); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const short = (s) => { const d = parse(s); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; };
const time = (t) => String(t || '').slice(0, 5);
const monthStart = (s) => `${String(s).slice(0, 7)}-01`;
const monthEnd = (s) => { const d = parse(monthStart(s)); d.setMonth(d.getMonth() + 1); d.setDate(0); return toISO(d); };

module.exports = { DAY_NAMES, DAY_SHORT, MONTHS, toISO, parse, today, addDays, weekday, monday, isDate, human, short, time, monthStart, monthEnd };
