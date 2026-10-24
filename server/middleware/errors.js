// Обработка ошибок: понятное сообщение пользователю, подробности в консоль
const { AppError } = require('../utils/errors');

function notFound(req, res) {
  if (req.originalUrl.startsWith('/api/')) return res.status(404).json({ error: 'Не найдено' });
  res.status(404).render('public/error', { title: 'Страница не найдена', message: 'Такой страницы нет. Проверьте адрес или перейдите на главную.', page: 'error' });
}

// eslint-disable-next-line no-unused-vars
function handler(err, req, res, next) {
  let status = err.status || 500;
  let message = err instanceof AppError ? err.message : 'Внутренняя ошибка сервера';
  if (err.code === 'LIMIT_FILE_SIZE') { status = 400; message = 'Файл больше 5 МБ'; }
  if (err.code === '23505') { status = 409; message = 'Такая запись уже существует'; }
  if (err.code === '23503') { status = 409; message = 'Запись связана с другими данными, её нельзя удалить или изменить так'; }
  if (err.code === '23514') { status = 400; message = 'Значение не прошло проверку базы данных'; }
  if (status >= 500) console.error(err);
  if (req.originalUrl.startsWith('/api/')) return res.status(status).json({ error: message });
  // Для форм: вернуться на страницу с сообщением
  if (req.method === 'POST' && req.session) {
    req.session.flash = { type: 'error', text: message };
    return res.redirect(req.get('referer') || '/');
  }
  res.status(status).render('public/error', { title: 'Ошибка', message, page: 'error' });
}

module.exports = { notFound, handler };
