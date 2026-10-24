// Журнал занятия: собирает отметки по ученикам и отправляет одним запросом
(function () {
  'use strict';
  const { api, toast } = window.App;
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('journal-form');
    if (!form) return;
    // Баллы ставятся только присутствующим
    const sync = (tr) => {
      const st = tr.querySelector('input[type=radio]:checked').value;
      const pts = tr.querySelector('.input--points');
      pts.disabled = st !== 'present';
      if (pts.disabled) pts.value = '';
    };
    form.querySelectorAll('tr[data-child]').forEach((tr) => { sync(tr); tr.addEventListener('change', () => sync(tr)); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (form.dataset.future) { toast('Отмечать посещаемость можно в день занятия или позже'); return; }
      const marks = [...form.querySelectorAll('tr[data-child]')].map((tr) => {
        const id = tr.dataset.child;
        return { childId: Number(id), status: tr.querySelector('input[type=radio]:checked').value, points: form[`pt-${id}`].value, comment: form[`cm-${id}`].value };
      });
      const fd = new FormData();
      fd.append('marks', JSON.stringify(marks));
      fd.append('topic', form.topic.value);
      fd.append('homework', form.homework.value);
      fd.append('dueDate', form.dueDate.value);
      if (form.file.files[0]) fd.append('file', form.file.files[0]);
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        const res = await api(form.action, { method: 'POST', form: fd });
        toast(res.message || 'Сохранено');
        setTimeout(() => location.reload(), 800);
      } catch (err) { toast(err.message); btn.disabled = false; }
    });
  });
})();
