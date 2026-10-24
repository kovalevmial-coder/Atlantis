// Общие действия: журнал аудита, уведомления, файлы
const db = require('../config/db');

async function audit(userId, action, entity, entityId, details, q = db) {
  await q.query('INSERT INTO audit_log (user_id, action, entity, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
    [userId || null, action, entity || null, entityId || null, details ? JSON.stringify(details) : null]);
}

async function notify(userId, text, q = db) {
  if (!userId) return;
  await q.query('INSERT INTO notifications (user_id, text) VALUES ($1, $2)', [userId, text.slice(0, 500)]);
}

// Сохранить загруженный файл (multer) в БД, вернуть id
async function saveFile(file, q = db) {
  if (!file) return null;
  const row = await q.one('INSERT INTO files (name, mime, size, data) VALUES ($1,$2,$3,$4) RETURNING id',
    [file.originalname.slice(0, 255), file.mimetype, file.size, file.buffer]);
  return row.id;
}

module.exports = { audit, notify, saveFile };
