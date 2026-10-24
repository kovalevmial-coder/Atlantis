// Защита от подделки межсайтовых запросов: изменяющие запросы принимаются только со своего сайта
function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin') || req.get('referer') || '';
  const host = req.get('host');
  if (!origin) return next(); // запросы без браузера (тесты, curl)
  try {
    if (new URL(origin).host === host) return next();
  } catch { /* неверный заголовок */ }
  res.status(403).json({ error: 'Запрос с чужого сайта отклонён' });
}
module.exports = { sameOrigin };
