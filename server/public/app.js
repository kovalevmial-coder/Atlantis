/*
 * Общие функции клиентской части приложения: запросы к REST API, уведомления, выход.
 */
(function () {
  'use strict';

  // Запрос к API: JSON или FormData, ошибка сервера превращается в исключение с текстом по-русски
  async function api(url, { method = 'GET', body, form } = {}) {
    const opts = { method, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    if (form) opts.body = form;
    else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const res = await fetch(url, opts);
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    if (!res.ok) {
      const err = new Error((data && data.error) || `Ошибка ${res.status}`);
      err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => `${Number(n || 0).toFixed(2).replace('.', ',')} руб.`;
  const toast = (m) => (window.AtlantisUI ? window.AtlantisUI.toast(m) : alert(m));
  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const human = (s) => { const d = parse(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
  const short = (s) => s ? s.split('-').reverse().join('.') : '';

  // Формы с data-api отправляются через fetch, ответ показывается всплывающим сообщением
  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('form[data-api]');
    if (!form) return;
    e.preventDefault();
    if (form.dataset.confirm && !window.confirm(form.dataset.confirm)) return;
    const btn = form.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      const hasFile = form.querySelector('input[type="file"]');
      const data = await api(form.action, {
        method: form.dataset.method || 'POST',
        form: hasFile ? new FormData(form) : undefined,
        body: hasFile ? undefined : Object.fromEntries(new FormData(form))
      });
      if (data && data.message) toast(data.message);
      if (data && data.redirect) { location.href = data.redirect; return; }
      if (form.dataset.reload !== undefined) setTimeout(() => location.reload(), data && data.message ? 900 : 0);
      form.dispatchEvent(new CustomEvent('api:done', { detail: data }));
    } catch (err) {
      toast(err.message);
      form.dispatchEvent(new CustomEvent('api:error', { detail: err }));
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // Кнопки с data-post отправляют POST без формы
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-post]');
    if (!btn) return;
    e.preventDefault();
    if (btn.dataset.confirm && !window.confirm(btn.dataset.confirm)) return;
    try {
      const data = await api(btn.dataset.post, { method: btn.dataset.method || 'POST', body: btn.dataset.body ? JSON.parse(btn.dataset.body) : {} });
      if (data && data.message) toast(data.message);
      if (data && data.redirect) { location.href = data.redirect; return; }
      if (btn.dataset.reload !== undefined) setTimeout(() => location.reload(), 700);
    } catch (err) { toast(err.message); }
  });

  window.App = { api, esc, money, toast, MONTHS, MONTHS_NOM, parse, iso, human, short };
})();
