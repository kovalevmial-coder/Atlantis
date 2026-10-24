// Вход, регистрация с кодом из письма, восстановление пароля
(function () {
  'use strict';
  const { api, toast } = window.App;
  const panels = ['login', 'register', 'verify', 'forgot'];
  const show = (name) => panels.forEach((p) => { document.getElementById(`panel-${p}`).hidden = p !== name; });

  document.addEventListener('DOMContentLoaded', () => {
    const verifyEmail = (email) => {
      document.querySelector('[data-verify-email]').textContent = email;
      document.querySelector('#verify-form [name="email"]').value = email;
      show('verify');
      document.getElementById('v-code').focus();
    };

    document.getElementById('register-form').addEventListener('api:done', (e) => verifyEmail(e.detail.email));
    document.getElementById('login-form').addEventListener('api:error', (e) => {
      if (e.detail.data && e.detail.data.needVerify) verifyEmail(document.getElementById('l-email').value);
    });
    document.querySelector('[data-resend]').addEventListener('click', async () => {
      try { await api('/api/auth/resend', { method: 'POST', body: { email: document.querySelector('#verify-form [name="email"]').value } }); toast('Новый код отправлен'); } catch (err) { toast(err.message); }
    });
    document.querySelectorAll('[data-auth-step="forgot"]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); show('forgot'); }));
    document.getElementById('forgot-form').addEventListener('api:done', () => {
      const email = document.getElementById('f-email').value;
      document.querySelector('#reset-form [name="email"]').value = email;
      document.getElementById('forgot-form').hidden = true;
      document.getElementById('reset-form').hidden = false;
    });
    document.querySelectorAll('[data-toggle-password]').forEach((btn) => btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.togglePassword);
      const showIt = input.type === 'password';
      input.type = showIt ? 'text' : 'password';
      btn.textContent = showIt ? 'Скрыть' : 'Показать';
    }));
  });
})();
