/*
 * Расписание в стиле ИИС БГУИР: поиск по группе, учителю, кабинету или точке,
 * вид «Таблица» (дни × пары) и «Список», переключение недель, подсветка сегодняшнего дня.
 * Используется на странице «Расписание» и в кабинетах (родитель, учитель, директор).
 */
(function () {
  'use strict';
  const { api, esc, parse, iso, short, MONTHS } = window.App;
  const DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  const TYPE_TITLE = { group: 'Группа', teacher: 'Учитель', room: 'Кабинет', branch: 'Точка' };
  const STORE = 'atlantis.schedule.view';

  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const mondayOf = (s) => { const d = parse(s); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return iso(d); };
  const nowTime = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  // Номер учебной недели: учебный год начинается 1 сентября
  const studyWeek = (monday) => {
    const d = parse(monday);
    const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
    const start = mondayOf(`${y}-09-01`);
    return Math.floor((parse(monday) - parse(start)) / (7 * 864e5)) + 1;
  };
  const textColor = (hex) => hex;
  const soft = (hex) => `${hex}1f`;

  function mount(root) {
    const mode = root.dataset.mode;
    const params = new URLSearchParams(location.search);
    const state = {
      type: root.dataset.type || ['group', 'teacher', 'room', 'branch'].find((t) => params.get(t)) || null,
      id: root.dataset.id || null,
      week: mondayOf(params.get('week') || iso(new Date())),
      view: params.get('view') || safeGet() || (window.innerWidth < 760 ? 'list' : 'table'),
      past: true, cancelled: true, catalog: null, data: null
    };
    if (!state.id && state.type) state.id = params.get(state.type);
    const $ = (sel) => root.querySelector(sel);
    const body = $('[data-sch-body]');

    function safeGet() { try { return localStorage.getItem(STORE); } catch { return null; } }
    function safeSet(v) { try { localStorage.setItem(STORE, v); } catch { /* приватный режим */ } }

    async function loadCatalog() {
      if (mode !== 'public' && mode !== 'director') return;
      state.catalog = await api('/api/schedule/catalog');
      if (!state.type) {
        // По умолчанию — первая точка целиком
        if (state.catalog.branches.length) { state.type = 'branch'; state.id = String(state.catalog.branches[0].id); }
      }
    }

    function syncUrl() {
      if (mode !== 'public') return;
      const p = new URLSearchParams();
      if (state.type) p.set(state.type, state.id);
      if (state.week !== mondayOf(iso(new Date()))) p.set('week', state.week);
      if (state.view === 'list') p.set('view', 'list');
      history.replaceState(null, '', `${location.pathname}${p.toString() ? '?' + p : ''}`);
    }

    async function load() {
      body.innerHTML = '<p class="sch__empty">Загрузка расписания…</p>';
      const q = new URLSearchParams({ start: state.week });
      if (state.type) { q.set('type', state.type); q.set('id', state.id); }
      try {
        state.data = await api(`/api/schedule/week?${q}`);
      } catch (err) {
        body.innerHTML = `<p class="sch__empty">${esc(err.message)}</p>`;
        return;
      }
      syncUrl();
      render();
    }

    function infoCard() {
      const el = $('[data-sch-info]');
      if (!el) return;
      const c = state.catalog;
      let html = '';
      if (c && state.type === 'group') {
        const g = c.groups.find((x) => String(x.id) === String(state.id));
        if (g) html = `<div class="sch-card-info"><div><a class="sch-card-info__title" href="?group=${g.id}">${esc(g.title)}</a>
          <div class="sch-card-info__sub">${esc(g.product)} · ${esc(g.branch)}</div></div>
          <dl class="sch-card-info__dl"><div><dt>Начало занятий:</dt><dd>${short(g.start_date)}</dd></div><div><dt>Конец занятий:</dt><dd>${short(g.end_date)}</dd></div>
          <div><dt>Учитель:</dt><dd>${esc(g.teacher)}</dd></div><div><dt>Мест:</dt><dd>${g.capacity - g.taken > 0 ? `свободно ${g.capacity - g.taken} из ${g.capacity}` : 'нет, лист ожидания'}</dd></div></dl></div>`;
      } else if (c && state.type === 'teacher') {
        const t = c.teachers.find((x) => String(x.id) === String(state.id));
        if (t) html = `<div class="sch-card-info sch-card-info--person"><img src="${t.photo_id ? '/files/' + t.photo_id : (t.photo_url || '/img/pedagog-portret.jpg')}" alt="" class="sch-card-info__photo">
          <div><span class="sch-card-info__title">${esc(t.full_name)}</span><div class="sch-card-info__sub">${esc(t.position || 'Учитель')}</div>
          ${t.slug ? `<a href="/pedagog/${t.slug}" class="small">Страница учителя</a>` : ''}</div></div>`;
      } else if (c && state.type === 'room') {
        const r = c.rooms.find((x) => String(x.id) === String(state.id));
        if (r) html = `<div class="sch-card-info"><span class="sch-card-info__title">${esc(r.name)}</span><div class="sch-card-info__sub">${esc(r.branch)}</div></div>`;
      } else if (c && state.type === 'branch') {
        const b = c.branches.find((x) => String(x.id) === String(state.id));
        if (b) html = `<div class="sch-card-info"><span class="sch-card-info__title">${esc(b.name)}</span><div class="sch-card-info__sub">${esc(b.address)} · все группы точки</div></div>`;
      }
      el.innerHTML = html;
      const input = $('[data-sch-search]');
      if (input && document.activeElement !== input && c) input.value = currentLabel();
    }

    function currentLabel() {
      const c = state.catalog; if (!c || !state.type) return '';
      const list = { group: c.groups, teacher: c.teachers, room: c.rooms, branch: c.branches }[state.type];
      const item = list.find((x) => String(x.id) === String(state.id));
      return item ? (item.title || item.full_name || item.name) : '';
    }

    // Подпись в «пилюле» карточки: на расписании группы — учитель, на расписании учителя — группа
    function pill(l) {
      if (state.type === 'teacher' || mode === 'teacher') return `<a class="sch-pill" href="/raspisanie.html?group=${l.group_id}">${esc(l.group_title)}</a>`;
      const name = l.teacher.split(' ');
      const label = name.length >= 3 ? `${name[0]} ${name[1][0]}. ${name[2][0]}.` : l.teacher;
      return `<a class="sch-pill" href="/raspisanie.html?teacher=${l.teacher_id}">${esc(label)}</a>`;
    }

    function seats(l) {
      const free = l.capacity - l.taken;
      if (mode !== 'public') return `<span class="sch-seats" title="Записано детей">${icon('users')} ${l.taken}/${l.capacity}</span>`;
      const cls = free <= 0 ? 'none' : free <= 2 ? 'few' : 'ok';
      return `<span class="sch-seats sch-seats--${cls}" title="Свободных мест">${icon('users')} ${free > 0 ? free : 0}</span>`;
    }
    const icon = (n) => (window.AtlantisUI ? window.AtlantisUI.icon(n) : '');

    function lessonCard(l) {
      const cancelled = l.status === 'cancelled';
      const done = l.status === 'done';
      const clickable = mode === 'teacher' || mode === 'director';
      return `<${clickable ? 'button type="button"' : 'div'} class="sch-lesson${cancelled ? ' is-cancelled' : ''}${done ? ' is-done' : ''}" style="--c:${textColor(l.color)}" ${clickable ? `data-lesson="${l.id}"` : ''}>
        <div class="sch-lesson__row"><b>${esc(l.code)}</b><span class="sch-lesson__room">${esc(l.room)}</span></div>
        <div class="sch-lesson__type">${esc(l.product)}</div>
        <div class="sch-lesson__meta">${mode === 'director' || mode === 'parent' ? esc(l.group_title) : ''}</div>
        ${l.note ? `<div class="sch-lesson__note">${esc(l.note)}</div>` : ''}
        <div class="sch-lesson__row">${pill(l)}${seats(l)}</div>
        ${done && clickable ? '<span class="sch-lesson__badge">журнал заполнен</span>' : ''}
      </${clickable ? 'button' : 'div'}>`;
    }

    function visible() {
      const today = state.data.today; const now = nowTime();
      return state.data.lessons.filter((l) => {
        if (!state.cancelled && l.status === 'cancelled') return false;
        if (!state.past && (l.date < today || (l.date === today && l.end <= now))) return false;
        return true;
      });
    }

    function render() {
      infoCard();
      const { from, today } = state.data;
      const no = studyWeek(from);
      $('[data-sch-weekno]').innerHTML = `${no > 0 && no < 45 ? `<span class="sch__weekno">${no}-я учебная неделя</span>` : ''}<span class="sch__range">${short(from)} – ${short(addDays(from, 6))}</span>`;
      root.querySelectorAll('[data-sch-view]').forEach((b) => b.classList.toggle('is-active', b.dataset.schView === state.view));
      const lessons = visible();
      const hasSunday = lessons.some((l) => parse(l.date).getDay() === 0);
      const days = Array.from({ length: hasSunday ? 7 : 6 }, (_, i) => addDays(from, i));
      if (!state.data.lessons.length) {
        body.innerHTML = '<p class="sch__empty">На этой неделе занятий нет.</p>';
        return;
      }
      body.innerHTML = state.view === 'list' ? renderList(days, lessons, today) : renderTable(days, lessons, today);
      if (window.AtlantisUI) window.AtlantisUI.renderIcons(body);
    }

    function renderTable(days, lessons, today) {
      // Строки таблицы — уникальные интервалы времени («пары»)
      const slots = [...new Map(lessons.map((l) => [`${l.start}-${l.end}`, { start: l.start, end: l.end }])).values()]
        .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
      const now = nowTime();
      const head = days.map((d, i) => `<th class="${d === today ? 'is-today' : ''}"><span>${DAYS[i]}</span><small>${d === today ? '(сегодня), ' : ''}${short(d).slice(0, 5)}</small></th>`).join('');
      const rows = slots.map((s) => {
        const weekPast = days[days.length - 1] < today;
        const state0 = (d) => (d < today || (d === today && s.end <= now)) ? 'past' : (d === today && s.start <= now && now < s.end) ? 'now' : 'future';
        const mark = (t, pos) => {
          const st = weekPast ? 'past' : days.includes(today) ? state0(today) : (days[0] > today ? 'future' : 'past');
          return `<span class="sch-time__t">${t}<i class="sch-dot sch-dot--${pos === 'start' && st === 'now' ? 'now' : st}"></i></span>`;
        };
        const cells = days.map((d) => {
          const list = lessons.filter((l) => l.date === d && l.start === s.start && l.end === s.end);
          return `<td class="${d === today ? 'is-today' : ''}${state0(d) === 'past' ? ' is-past' : ''}">${list.length ? list.map(lessonCard).join('') : '<div class="sch-none">Занятий нет</div>'}</td>`;
        }).join('');
        return `<tr><th class="sch-time">${mark(s.start, 'start')}${mark(s.end, 'end')}</th>${cells}</tr>`;
      }).join('');
      return `<div class="sch-table-wrap"><table class="sch-table"><thead><tr><th class="sch-time"></th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    function renderList(days, lessons, today) {
      const html = days.map((d, i) => {
        const list = lessons.filter((l) => l.date === d);
        if (!list.length) return '';
        return `<section class="sch-day${d === today ? ' is-today' : ''}"><header class="sch-day__head"><span>${DAYS[i]}${d === today ? ' <small>(сегодня)</small>' : ''}</span><span>${short(d)}</span></header>
          ${list.map((l) => `<div class="sch-row${l.status === 'cancelled' ? ' is-cancelled' : ''}"${mode === 'teacher' || mode === 'director' ? ` data-lesson="${l.id}" role="button" tabindex="0"` : ''}>
            <div class="sch-row__time"><b>${l.start}</b><small>${l.end}</small></div>
            <div class="sch-row__main"><b>${esc(l.code)}</b> <span class="sch-label" style="--c:${l.color}">${esc(l.product)}</span>
              <div class="sch-row__sub">${esc(l.group_title)} · ${esc(l.branch)}${l.note ? ` · <span class="sch-lesson__note">${esc(l.note)}</span>` : ''}</div></div>
            <div class="sch-row__side">${pill(l)}<span class="sch-lesson__room">${esc(l.room)}</span></div>
          </div>`).join('')}</section>`;
      }).join('');
      return `<div class="sch-list">${html || '<p class="sch__empty">Нет занятий по выбранным условиям.</p>'}</div>`;
    }

    // Поиск с подсказками
    const input = $('[data-sch-search]');
    const sug = $('[data-sch-suggest]');
    if (input) {
      const items = () => {
        const c = state.catalog; if (!c) return [];
        return [
          ...c.groups.map((g) => ({ type: 'group', id: g.id, title: g.title, sub: `${g.product} · ${g.teacher}` })),
          ...c.teachers.map((t) => ({ type: 'teacher', id: t.id, title: t.full_name, sub: t.position || 'Учитель' })),
          ...c.rooms.map((r) => ({ type: 'room', id: r.id, title: r.name, sub: r.branch })),
          ...c.branches.map((b) => ({ type: 'branch', id: b.id, title: b.name, sub: b.address }))
        ];
      };
      const show = () => {
        const q = input.value.trim().toLowerCase();
        const list = items().filter((x) => !q || x.title.toLowerCase().includes(q) || x.sub.toLowerCase().includes(q)).slice(0, 12);
        sug.innerHTML = list.map((x, i) => `<li role="option" tabindex="-1" data-type="${x.type}" data-id="${x.id}" class="${i === 0 ? 'is-active' : ''}">
          <span class="sch__suggest-type">${TYPE_TITLE[x.type]}</span><b>${esc(x.title)}</b><small>${esc(x.sub)}</small></li>`).join('') || '<li class="sch__suggest-empty">Ничего не найдено</li>';
        sug.hidden = false;
      };
      const pick = (li) => {
        if (!li || !li.dataset.type) return;
        state.type = li.dataset.type; state.id = li.dataset.id; sug.hidden = true; input.blur(); load();
      };
      input.addEventListener('focus', () => { input.select(); show(); });
      input.addEventListener('input', show);
      input.addEventListener('keydown', (e) => {
        const lis = [...sug.querySelectorAll('li[data-type]')];
        const i = lis.findIndex((li) => li.classList.contains('is-active'));
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const n = lis[(i + (e.key === 'ArrowDown' ? 1 : -1) + lis.length) % lis.length];
          lis.forEach((li) => li.classList.toggle('is-active', li === n));
        }
        if (e.key === 'Enter') { e.preventDefault(); pick(lis[i] || lis[0]); }
        if (e.key === 'Escape') { sug.hidden = true; input.blur(); }
      });
      sug.addEventListener('mousedown', (e) => pick(e.target.closest('li')));
      input.addEventListener('blur', () => setTimeout(() => { sug.hidden = true; infoCard(); }, 150));
    }

    root.addEventListener('click', (e) => {
      const v = e.target.closest('[data-sch-view]');
      if (v) { state.view = v.dataset.schView; safeSet(state.view); syncUrl(); render(); }
      const sh = e.target.closest('[data-sch-shift]');
      if (sh) { state.week = addDays(state.week, Number(sh.dataset.schShift)); load(); }
      if (e.target.closest('[data-sch-today]')) { state.week = mondayOf(iso(new Date())); load(); }
      const lesson = e.target.closest('[data-lesson]');
      if (lesson) root.dispatchEvent(new CustomEvent('lesson:open', { detail: { id: Number(lesson.dataset.lesson) }, bubbles: true }));
    });
    root.addEventListener('keydown', (e) => {
      const lesson = e.target.closest('.sch-row[data-lesson]');
      if (lesson && e.key === 'Enter') lesson.click();
    });
    $('[data-sch-past]').addEventListener('change', (e) => { state.past = e.target.checked; render(); });
    $('[data-sch-cancelled]').addEventListener('change', (e) => { state.cancelled = e.target.checked; render(); });

    root.reload = load;
    loadCatalog().then(load).catch((err) => { body.innerHTML = `<p class="sch__empty">${esc(err.message)}</p>`; });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-schedule]').forEach(mount);
  });
  window.AtlantisSchedule = { mount };
})();
