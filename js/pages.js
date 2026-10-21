/*
 * Отрисовка содержимого страниц из данных (data.js).
 * Страница определяется атрибутом data-page у <body>.
 */
(function () {
  'use strict';

  const D = window.ATLANTIS;
  const byId = Object.fromEntries(D.directions.map((d) => [d.id, d]));
  const ui = () => window.AtlantisUI;
  const icon = (n, c) => ui().icon(n, c);

  const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const DAY_NAMES = { 'Пн': 'Понедельник', 'Вт': 'Вторник', 'Ср': 'Среда', 'Чт': 'Четверг', 'Пт': 'Пятница', 'Сб': 'Суббота' };

  /* ---------- Шаблоны ---------- */
  function formatPrice(d) {
    const prefix = d.priceUnit === 'за занятие' ? '' : 'от ';
    return `${prefix}${d.price} руб. <small>${d.priceUnit}</small>`;
  }

  function detailsHref(d) {
    return d.link || `napravleniya.html#${d.id}`;
  }

  function dirCard(d) {
    const online = d.category === 'online';
    return `
      <article class="card card--hover dir-card reveal" data-category="${d.category}">
        <div class="ph"><span>Фото: ${d.title.toLowerCase()}</span></div>
        <div class="dir-card__body">
          <span class="badge ${online ? 'badge--accent' : ''}">${d.age}</span>
          <h3>${d.title}</h3>
          <p class="muted">${d.short}</p>
          <ul class="dir-card__meta">
            <li>${icon('clock')} ${d.duration}</li>
            <li>${icon(online ? 'globe' : 'users')} ${d.group}</li>
            <li>${icon('calendar')} ${d.days}</li>
          </ul>
          <div class="dir-card__price">${formatPrice(d)}</div>
          <div class="dir-card__actions">
            <a class="btn btn--primary btn--sm" href="#signup" data-signup data-dir="${d.id}">Записаться</a>
            <a class="btn btn--ghost btn--sm" href="${detailsHref(d)}">Подробнее</a>
          </div>
        </div>
      </article>`;
  }

  function reviewCard(r) {
    return `
      <figure class="card review reveal">
        <blockquote class="review__text">${r.text}</blockquote>
        <figcaption class="review__author">
          <div class="ph ph--round"></div>
          <div><strong>${r.author}</strong><br><span class="review__source">${r.about} · ${r.source}</span></div>
        </figcaption>
      </figure>`;
  }

  function faqItems(list) {
    return list.map((f, i) => `
      <div class="faq__item">
        <button class="faq__q" type="button" aria-expanded="false" aria-controls="faq-a-${i}">
          ${f.q} ${icon('plus')}
        </button>
        <div class="faq__a" id="faq-a-${i}" role="region"><div><p>${f.a}</p></div></div>
      </div>`).join('');
  }

  function seats(item) {
    const free = item.total - item.taken;
    const cls = free === 0 ? 'seats--full' : free <= 2 ? 'seats--few' : '';
    const label = free === 0 ? 'мест нет' : `свободно ${free} из ${item.total}`;
    return `<span class="seats ${cls}"><span class="seats__bar"><i style="width:${(item.taken / item.total) * 100}%"></i></span>${label}</span>`;
  }

  function fill(sel, html) {
    const el = document.querySelector(sel);
    if (el) el.innerHTML = html;
    return el;
  }

  /* ---------- Главная ---------- */
  function home() {
    const featured = ['podgotovka-1', 'klass-1', 'klass-3-4', 'kalligrafiya', 'matematika-5-6', 'english'];
    fill('#home-dirs', featured.map((id) => dirCard(byId[id])).join(''));
    fill('#reviews', D.reviews.slice(0, 3).map(reviewCard).join(''));
    fill('#faq', faqItems(D.faq));
  }

  /* ---------- Направления ---------- */
  function directions() {
    const grid = fill('#dir-grid', D.directions.map(dirCard).join(''));
    fill('#dir-filter', D.categories.map((c, i) =>
      `<button class="chip" type="button" data-filter="${c.id}" aria-pressed="${i === 0}">${c.title}</button>`).join(''));

    document.querySelector('#dir-filter').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      document.querySelectorAll('#dir-filter .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      const f = chip.dataset.filter;
      grid.querySelectorAll('.dir-card').forEach((card) => {
        const show = f === 'all' || card.dataset.category === f;
        card.hidden = !show;
        if (show) { card.classList.remove('is-visible'); requestAnimationFrame(() => card.classList.add('is-visible')); }
      });
    });

    fill('#dir-details', D.directions.filter((d) => !d.link).map((d) => `
      <section class="dir-detail anchor-target" id="${d.id}">
        <div class="ph reveal"><span>Фото: ${d.title.toLowerCase()}</span></div>
        <div class="reveal">
          <span class="badge">${d.age}</span>
          <h2>${d.title}</h2>
          <p class="lead">${d.short}</p>
          <h3>Программа</h3>
          <ul class="checklist">${d.program.map((p) => `<li>${p}</li>`).join('')}</ul>
          ${d.forWhom ? `<h3>Вам к нам, если</h3><ul class="checklist">${d.forWhom.map((p) => `<li>${p}</li>`).join('')}</ul>` : ''}
          <dl class="info-list">
            <dt>Длительность</dt><dd>${d.duration}</dd>
            <dt>Группа</dt><dd>${d.group}</dd>
            <dt>Дни</dt><dd>${d.days}</dd>
            <dt>Стоимость</dt><dd>${d.price} руб. ${d.priceUnit}</dd>
          </dl>
          <div class="btn-row">
            <a class="btn btn--primary" href="#signup" data-signup data-dir="${d.id}">Записаться на пробное</a>
            <a class="btn btn--secondary" href="raspisanie.html?dir=${d.id}">Расписание группы</a>
          </div>
        </div>
      </section>`).join(''));

    // Подсветка направления, на которое перешли по ссылке
    const highlight = () => {
      const target = location.hash && document.querySelector(location.hash);
      if (target && target.classList.contains('dir-detail')) {
        target.classList.remove('is-highlight');
        void target.offsetWidth;
        target.classList.add('is-highlight');
      }
    };
    window.addEventListener('hashchange', highlight);
    setTimeout(highlight, 300);
  }

  /* ---------- Расписание ---------- */
  function schedule() {
    const params = new URLSearchParams(location.search);
    const state = { category: 'all', dir: params.get('dir') || '' };

    fill('#sched-filter', D.categories.filter((c) => c.id !== 'online').map((c, i) =>
      `<button class="chip" type="button" data-filter="${c.id}" aria-pressed="${i === 0}">${c.title}</button>`).join(''));

    const dirSelect = document.querySelector('#sched-dir');
    dirSelect.innerHTML = '<option value="">Все направления</option>' + D.directions
      .filter((d) => d.category !== 'online')
      .map((d) => `<option value="${d.id}">${d.title}</option>`).join('');
    dirSelect.value = state.dir;

    const render = () => {
      const rows = D.schedule.filter((s) => {
        const d = byId[s.dir];
        return (state.category === 'all' || d.category === state.category) && (!state.dir || s.dir === state.dir);
      });
      const empty = '<p class="muted">По выбранным условиям занятий нет. Оставьте заявку, и мы подберём группу.</p>';

      fill('#sched-table tbody', rows.map((s) => {
        const d = byId[s.dir];
        const full = s.total === s.taken;
        return `<tr>
          <td><strong>${DAY_NAMES[s.day]}</strong></td>
          <td>${s.time}</td>
          <td><a href="${detailsHref(d)}">${d.title}</a><br><span class="small muted">${d.age}</span></td>
          <td>${s.room}</td>
          <td>${seats(s)}</td>
          <td>${full
            ? '<button class="btn btn--ghost btn--sm" type="button" data-waitlist>В лист ожидания</button>'
            : `<a class="btn btn--primary btn--sm" href="#signup" data-signup data-dir="${d.id}">Записаться</a>`}</td>
        </tr>`;
      }).join('') || `<tr><td colspan="6">${empty}</td></tr>`);

      fill('#sched-cards', DAYS.map((day) => {
        const items = rows.filter((s) => s.day === day);
        if (!items.length) return '';
        return `<div class="sched-day"><h3>${DAY_NAMES[day]}</h3>${items.map((s) => {
          const d = byId[s.dir];
          const full = s.total === s.taken;
          return `<div class="card sched-item">
            <span class="sched-item__time">${s.time}</span>
            <span><strong>${d.title}</strong><br><span class="small muted">${d.age} · ${s.room}</span></span>
            <span style="grid-column:1/-1">${seats(s)}</span>
            ${full
              ? '<button class="btn btn--ghost btn--sm" type="button" data-waitlist>В лист ожидания</button>'
              : `<a class="btn btn--primary btn--sm" href="#signup" data-signup data-dir="${d.id}">Записаться</a>`}
          </div>`;
        }).join('')}</div>`;
      }).join('') || empty);
    };

    document.querySelector('#sched-filter').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      document.querySelectorAll('#sched-filter .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      state.category = chip.dataset.filter;
      state.dir = '';
      dirSelect.value = '';
      render();
    });
    dirSelect.addEventListener('change', () => { state.dir = dirSelect.value; render(); });
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-waitlist]')) ui().toast('Лист ожидания заработает после подключения личного кабинета');
    });
    render();
  }

  /* ---------- Цены ---------- */
  function prices() {
    fill('#prices', D.prices.map((p) => `
      <article class="card price-card reveal ${p.featured ? 'price-card--featured' : ''}">
        <h3>${p.title}</h3>
        <div class="price-card__value">${p.value} <small>${p.unit}</small></div>
        <p class="muted small">${p.note}</p>
        <ul class="checklist">${p.items.map((i) => `<li>${i}</li>`).join('')}</ul>
        <a class="btn ${p.featured ? 'btn--primary' : 'btn--secondary'} btn--block" href="#signup" data-signup>Записаться на пробное</a>
      </article>`).join(''));

    fill('#price-table tbody', D.directions.map((d) => `
      <tr>
        <td><a href="${detailsHref(d)}">${d.title}</a></td>
        <td>${d.age}</td>
        <td>${d.duration}</td>
        <td><strong>${d.price} руб.</strong> <span class="small muted">${d.priceUnit}</span></td>
      </tr>`).join(''));
    fill('#faq', faqItems(D.faq.filter((f) => /оплат|пробное|середине/i.test(f.q))));
  }

  /* ---------- Педагог ---------- */
  function teacher() {
    fill('#reviews', D.reviews.map(reviewCard).join(''));
  }

  /* ---------- Каллиграфия ---------- */
  function calligraphy() {
    fill('#reviews', D.reviews.filter((r) => /каллиграф/i.test(r.about)).map(reviewCard).join(''));
    fill('#faq', faqItems(D.faq.filter((f) => /почерк|левш|пробное/i.test(f.q))));
  }

  /* ---------- Вход и регистрация ---------- */
  function auth() {
    document.querySelectorAll('.auth form').forEach((form) => {
      ui().initFormValidation(form);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!ui().validate(form)) return;
        // TODO: POST /api/auth/login и /api/auth/register, JWT-сессия, роли
        ui().toast('Вход заработает после подключения сервера. Пока можно открыть демо-кабинет.');
      });
    });
    document.querySelectorAll('[data-toggle-password]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.togglePassword);
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.textContent = show ? 'Скрыть' : 'Показать';
      });
    });
  }

  /* ---------- Личный кабинет (демо) ---------- */
  function cabinet() {
    // Демо-данные родителя: позже GET /api/me, /api/children/:id/lessons
    const child = { name: 'Маша', grade: '1 класс', groups: ['klass-1', 'kalligrafiya'] };
    const sub = { title: 'Абонемент «Помощь школьнику, 1 класс»', used: 5, total: 8, until: '30 ноября' };

    const upcoming = [
      { date: '22', month: 'окт', day: 'Ср', time: '15:00', dir: 'klass-1' },
      { date: '24', month: 'окт', day: 'Пт', time: '14:45', dir: 'kalligrafiya' },
      { date: '27', month: 'окт', day: 'Пн', time: '15:00', dir: 'klass-1' },
      { date: '29', month: 'окт', day: 'Ср', time: '15:00', dir: 'klass-1' }
    ];

    fill('#cab-child', `${child.name}, ${child.grade}`);
    fill('#cab-sub-title', sub.title);
    fill('#cab-sub-left', `${sub.total - sub.used}`);
    fill('#cab-sub-text', `Использовано ${sub.used} из ${sub.total} занятий, действует до ${sub.until}`);
    const bar = document.querySelector('#cab-sub-bar');
    if (bar) setTimeout(() => { bar.style.width = `${(sub.used / sub.total) * 100}%`; }, 300);

    const lessonRow = (l, actions) => {
      const d = byId[l.dir];
      return `<div class="lesson">
        <div class="lesson__date"><b>${l.date}</b>${l.month}</div>
        <div class="lesson__info"><strong>${d.title}</strong><span class="small muted">${DAY_NAMES[l.day]}, ${l.time} · ${child.name}</span></div>
        ${actions ? '<button class="btn btn--ghost btn--sm" type="button" data-demo="Перенос занятия">Перенести</button>' : ''}
      </div>`;
    };
    fill('#cab-next', upcoming.slice(0, 2).map((l) => lessonRow(l, false)).join(''));
    fill('#cab-lessons', upcoming.map((l) => lessonRow(l, true)).join(''));

    // Посещаемость за октябрь (демо)
    const marks = { 1: 'yes', 3: 'yes', 6: 'yes', 8: 'no', 10: 'yes', 13: 'yes', 15: 'yes', 17: 'yes', 20: 'yes', 22: 'plan', 24: 'plan', 27: 'plan', 29: 'plan' };
    const firstWeekday = 3; // 1 октября 2026 — четверг (Пн = 0)
    let cells = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => `<div class="attendance__head">${d}</div>`).join('');
    for (let i = 0; i < firstWeekday; i++) cells += '<div></div>';
    for (let day = 1; day <= 31; day++) {
      const m = marks[day];
      const title = m === 'yes' ? 'был' : m === 'no' ? 'пропуск' : m === 'plan' ? 'запланировано' : '';
      cells += `<div class="att ${m ? 'att--' + m : ''}" ${title ? `title="${day} октября: ${title}"` : ''}>${day}</div>`;
    }
    fill('#cab-attendance', cells);
    const visited = Object.values(marks).filter((m) => m === 'yes').length;
    const missed = Object.values(marks).filter((m) => m === 'no').length;
    fill('#cab-att-rate', `${Math.round((visited / (visited + missed)) * 100)}%`);

    fill('#cab-groups', child.groups.map((id) => dirCard(byId[id])).join(''));

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-demo]');
      if (btn) ui().toast(`${btn.dataset.demo}: функция заработает после подключения сервера`);
    });

    // Пункты меню кабинета работают как вкладки (ui.js), здесь только перезапуск анимаций
    const list = document.querySelector('.cab__menu');
    if (list) list.addEventListener('tabchange', () => ui().initReveal(document.querySelector('.cab__main')));
  }

  const PAGES = { home, directions, schedule, prices, teacher, calligraphy, auth, cabinet };

  document.addEventListener('atlantis:ready', () => {
    const page = document.body.dataset.page;
    if (PAGES[page]) PAGES[page]();
  });
})();
