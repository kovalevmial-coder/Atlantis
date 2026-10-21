/*
 * Общие элементы интерфейса для всех страниц:
 * иконки, шапка, мобильное меню, анимации появления, модальное окно записи,
 * уведомления, аккордеон, вкладки, слайдер «до/после», счётчики.
 */
(function () {
  'use strict';

  const D = window.ATLANTIS;
  document.documentElement.classList.add('js');

  /* ---------- Иконки (SVG-спрайт) ---------- */
  const ICONS = {
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    map: '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    chat: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z"/>',
    school: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    abc: '<path d="M4 18 8 6l4 12M5.5 14h5M14 6h4a3 3 0 0 1 0 6h-4zm0 6h4.5a3 3 0 0 1 0 6H14z"/>',
    calc: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h8"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    instagram: '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
    telegram: '<path d="m22 3-20 8 7 2 2 7 4-5 5 4z"/><path d="m9 13 13-10"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    wallet: '<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M16 15h2"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'
  };

  function injectSprite() {
    const symbols = Object.entries(ICONS)
      .map(([id, body]) => `<symbol id="i-${id}" viewBox="0 0 24 24">${body}</symbol>`).join('');
    const holder = document.createElement('div');
    holder.style.display = 'none';
    holder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${symbols}</svg>`;
    document.body.prepend(holder);
  }

  function icon(name, cls) {
    return `<svg class="icon ${cls || ''}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  }

  // Заменяет <i data-icon="phone"></i> на SVG
  function renderIcons(root) {
    (root || document).querySelectorAll('i[data-icon]').forEach((el) => {
      el.outerHTML = icon(el.dataset.icon, el.className);
    });
  }

  /* ---------- Шапка и мобильное меню ---------- */
  function initHeader() {
    const header = document.querySelector('.header');
    if (header) {
      const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    const burger = document.querySelector('.burger');
    const nav = document.querySelector('.nav');
    if (burger && nav) {
      const setOpen = (open) => {
        burger.setAttribute('aria-expanded', String(open));
        burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
        nav.classList.toggle('is-open', open);
        document.body.classList.toggle('no-scroll', open);
      };
      burger.addEventListener('click', () => setOpen(burger.getAttribute('aria-expanded') !== 'true'));
      nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
    }

    // Подсветка текущей страницы в меню
    const page = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav__link').forEach((a) => {
      if (a.getAttribute('href') === page) a.setAttribute('aria-current', 'page');
    });
  }

  /* ---------- Появление блоков при прокрутке ---------- */
  function initReveal(root) {
    const items = (root || document).querySelectorAll('.reveal:not(.is-visible)');
    if (!('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    items.forEach((el) => io.observe(el));
  }

  // Каскадная задержка для элементов сетки
  function stagger(container, step) {
    container.querySelectorAll(':scope > .reveal').forEach((el, i) => {
      el.style.setProperty('--delay', `${Math.min(i, 8) * (step || 0.07)}s`);
    });
  }

  /* ---------- Счётчики ---------- */
  function initCounters() {
    const els = document.querySelectorAll('[data-count]');
    if (!els.length) return;
    const run = (el) => {
      const target = Number(el.dataset.count);
      const suffix = el.dataset.suffix || '';
      const decimals = (el.dataset.count.split('.')[1] || '').length;
      const start = performance.now();
      const dur = 1200;
      const tick = (now) => {
        const p = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = (target * eased).toFixed(decimals).replace('.', ',') + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.5 });
    els.forEach((el) => io.observe(el));
  }

  /* ---------- Уведомление ---------- */
  let toastTimer;
  function toast(message) {
    let el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      el.setAttribute('role', 'status');
      document.body.append(el);
    }
    el.textContent = message;
    requestAnimationFrame(() => el.classList.add('is-visible'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3500);
  }

  /* ---------- Аккордеон ---------- */
  function initAccordion(root) {
    (root || document).querySelectorAll('.faq__q').forEach((btn) => {
      btn.addEventListener('click', () => {
        const open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!open));
      });
    });
  }

  /* ---------- Вкладки ---------- */
  function initTabs(root) {
    (root || document).querySelectorAll('[role="tablist"]').forEach((list) => {
      const tabs = list.querySelectorAll('[role="tab"]');
      const select = (tab) => {
        tabs.forEach((t) => {
          const selected = t === tab;
          t.setAttribute('aria-selected', String(selected));
          t.tabIndex = selected ? 0 : -1;
          const panel = document.getElementById(t.getAttribute('aria-controls'));
          if (panel) panel.hidden = !selected;
        });
        list.dispatchEvent(new CustomEvent('tabchange', { detail: tab }));
      };
      tabs.forEach((tab, i) => {
        tab.addEventListener('click', () => { if (!tab.disabled) select(tab); });
        tab.addEventListener('keydown', (e) => {
          const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
          if (!dir) return;
          e.preventDefault();
          const next = tabs[(i + dir + tabs.length) % tabs.length];
          next.focus();
          select(next);
        });
      });
    });
  }

  /* ---------- Слайдер «до/после» ---------- */
  function initBeforeAfter() {
    document.querySelectorAll('.ba').forEach((ba) => {
      const range = ba.querySelector('.ba__range');
      const set = (v) => ba.style.setProperty('--pos', `${v}%`);
      set(range.value);
      range.addEventListener('input', () => set(range.value));
      // Короткая подсказка-анимация при первом появлении
      const io = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const frames = [50, 35, 65, 50];
        frames.forEach((v, i) => setTimeout(() => { range.value = v; set(v); }, 300 + i * 350));
      }, { threshold: 0.6 });
      io.observe(ba);
    });
  }

  /* ---------- Маска телефона +375 ---------- */
  function phoneMask(input) {
    input.addEventListener('input', () => {
      let digits = input.value.replace(/\D/g, '');
      if (digits.startsWith('375')) digits = digits.slice(3);
      else if (digits.startsWith('80')) digits = digits.slice(2);
      digits = digits.slice(0, 9);
      let out = '+375';
      if (digits.length) out += ' (' + digits.slice(0, 2);
      if (digits.length >= 2) out += ')';
      if (digits.length > 2) out += ' ' + digits.slice(2, 5);
      if (digits.length > 5) out += '-' + digits.slice(5, 7);
      if (digits.length > 7) out += '-' + digits.slice(7, 9);
      input.value = out;
    });
    input.addEventListener('focus', () => {
      if (!input.value) input.value = '+375 ';
      // курсор в конец, чтобы цифры не вставлялись перед кодом страны
      setTimeout(() => input.setSelectionRange(input.value.length, input.value.length), 0);
    });
    input.addEventListener('blur', () => { if (input.value.trim() === '+375') input.value = ''; });
  }

  /* ---------- Проверка формы ---------- */
  function validate(form) {
    let ok = true;
    form.querySelectorAll('[data-validate]').forEach((input) => {
      const field = input.closest('.field') || input.closest('.check');
      let valid = true;
      const v = input.value.trim();
      switch (input.dataset.validate) {
        case 'required': valid = v.length > 0; break;
        case 'name': valid = v.length >= 2; break;
        case 'phone': valid = v.replace(/\D/g, '').length === 12; break;
        case 'email': valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); break;
        case 'password': valid = v.length >= 8; break;
        case 'checked': valid = input.checked; break;
      }
      if (field) field.classList.toggle('is-invalid', !valid);
      input.setAttribute('aria-invalid', String(!valid));
      if (!valid && ok) { input.focus(); ok = false; }
    });
    return ok;
  }

  function initFormValidation(form) {
    form.noValidate = true;
    form.querySelectorAll('input[type="tel"]').forEach(phoneMask);
    form.querySelectorAll('[data-validate]').forEach((input) => {
      const ev = input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'blur';
      input.addEventListener(ev, () => {
        const field = input.closest('.field') || input.closest('.check');
        if (field && field.classList.contains('is-invalid')) validate(form);
      });
    });
  }

  /* ---------- Модальное окно записи ---------- */
  function buildSignupModal() {
    const options = D.directions.map((d) => `<option value="${d.id}">${d.title}</option>`).join('');
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'signup';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="modal__overlay" data-close></div>
      <div class="modal__dialog" role="dialog" aria-modal="true" aria-labelledby="signup-title">
        <button class="modal__close" type="button" aria-label="Закрыть" data-close>${icon('close')}</button>
        <div class="signup-step">
          <h2 id="signup-title">Запись на пробное занятие</h2>
          <p class="muted">Оставьте контакты, и мы перезвоним, чтобы подобрать группу и удобное время.</p>
          <form class="form" id="signup-form">
            <div class="field">
              <label for="su-name">Имя родителя</label>
              <input class="input" id="su-name" name="parentName" autocomplete="name" data-validate="name">
              <span class="field__error">Введите имя</span>
            </div>
            <div class="field">
              <label for="su-phone">Телефон</label>
              <input class="input" id="su-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+375 (29) 000-00-00" data-validate="phone">
              <span class="field__error">Введите номер полностью</span>
            </div>
            <div class="field">
              <label for="su-dir">Направление</label>
              <select class="select" id="su-dir" name="direction">
                <option value="">Не знаю, помогите подобрать</option>${options}
              </select>
            </div>
            <div class="field">
              <label for="su-age">Возраст или класс ребёнка <span class="muted">(необязательно)</span></label>
              <input class="input" id="su-age" name="childAge" placeholder="Например, 6 лет или 2 класс">
            </div>
            <label class="check">
              <input type="checkbox" name="consent" data-validate="checked">
              <span>Согласен на обработку персональных данных в соответствии с <a href="kontakty.html#privacy">политикой конфиденциальности</a></span>
            </label>
            <span class="field__error" style="margin-top:-8px">Нужно согласие на обработку данных</span>
            <button class="btn btn--primary btn--block" type="submit">Записаться на пробное</button>
          </form>
        </div>
        <div class="form-success" hidden>
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/></svg>
          <h2>Спасибо, заявка принята!</h2>
          <p class="muted">Перезвоним вам сегодня в рабочее время. Можно сразу написать нам в Instagram.</p>
          <div class="btn-row" style="justify-content:center">
            <a class="btn btn--secondary" href="${D.center.instagram}" target="_blank" rel="noopener">${icon('instagram')} Написать в Instagram</a>
            <button class="btn btn--ghost" type="button" data-close>Закрыть</button>
          </div>
        </div>
      </div>`;
    document.body.append(modal);

    const form = modal.querySelector('#signup-form');
    const consent = form.querySelector('[name="consent"]');
    const consentError = consent.closest('.check').nextElementSibling;
    initFormValidation(form);
    consent.addEventListener('change', () => { consentError.style.display = consent.checked ? 'none' : ''; });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const ok = validate(form);
      consentError.style.display = consent.checked ? 'none' : 'block';
      if (!ok) return;
      // TODO: отправка на сервер — POST /api/requests
      const request = Object.fromEntries(new FormData(form));
      console.info('Заявка (будет отправлена на сервер):', request);
      modal.querySelector('.signup-step').hidden = true;
      modal.querySelector('.form-success').hidden = false;
    });

    let lastFocus = null;
    const open = (dirId) => {
      lastFocus = document.activeElement;
      form.reset();
      consentError.style.display = 'none';
      form.querySelectorAll('.is-invalid').forEach((f) => f.classList.remove('is-invalid'));
      modal.querySelector('.signup-step').hidden = false;
      modal.querySelector('.form-success').hidden = true;
      if (dirId) form.direction.value = dirId;
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('no-scroll');
      setTimeout(() => form.parentName.focus(), 50);
    };
    const close = () => {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('no-scroll');
      if (lastFocus) lastFocus.focus();
    };
    modal.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('is-open')) close(); });
    // Любой элемент с data-signup открывает запись; data-dir подставляет направление
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-signup]');
      if (!trigger) return;
      e.preventDefault();
      open(trigger.dataset.dir);
    });
  }

  /* ---------- Подстановка контактов ---------- */
  function fillContacts() {
    document.querySelectorAll('[data-center]').forEach((el) => {
      const key = el.dataset.center;
      el.textContent = D.center[key];
      if (key === 'phone' && el.tagName === 'A') el.href = D.center.phoneHref;
    });
    document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
  }

  /* ---------- Запуск ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    injectSprite();
    renderIcons();
    fillContacts();
    initHeader();
    buildSignupModal();
    // Страничные скрипты (pages.js) отрисовывают контент до анимаций
    document.dispatchEvent(new CustomEvent('atlantis:ready'));
    renderIcons();
    initAccordion();
    initTabs();
    initBeforeAfter();
    document.querySelectorAll('.grid, .task-grid, .steps').forEach((g) => stagger(g));
    initReveal();
    initCounters();
  });

  window.AtlantisUI = { icon, renderIcons, initReveal, stagger, toast, validate, initFormValidation, initAccordion };
})();
