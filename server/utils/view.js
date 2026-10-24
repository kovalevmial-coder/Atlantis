// Помощники для шаблонов: форматирование денег и дат, переключатель месяцев
const dates = require('./dates');

const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

const fmt = {
  money: (n) => `${Number(n || 0).toFixed(2).replace('.', ',')} руб.`,
  short: (s) => (s ? dates.short(s) : ''),
  human: (s) => (s ? dates.human(s) : ''),
  monthShort: (s) => MONTHS_SHORT[dates.parse(s).getMonth()],
  dayName: (s) => dates.DAY_NAMES[dates.weekday(s)],
  dayNames: dates.DAY_NAMES,
  dateTime: (d) => {
    if (!d) return '';
    const x = new Date(d);
    return `${dates.short(dates.toISO(x))} ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
  }
};

// Месяц из параметра ?month=YYYY-MM и ссылки на соседние месяцы
function monthNav(param) {
  const month = /^\d{4}-\d{2}$/.test(String(param || '')) ? param : dates.today().slice(0, 7);
  const start = `${month}-01`;
  const d = dates.parse(start);
  const shift = (n) => { const x = new Date(d.getFullYear(), d.getMonth() + n, 1); return dates.toISO(x).slice(0, 7); };
  return { month, start, end: dates.monthEnd(start), monthName: `${MONTHS_NOM[d.getMonth()]} ${d.getFullYear()}`, prevMonth: shift(-1), nextMonth: shift(1),
    monthIndex: d.getMonth() };
}

module.exports = { fmt, monthNav, MONTHS_NOM };
