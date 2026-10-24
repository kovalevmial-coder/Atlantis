// Загрузка файлов в память (затем сохраняются в БД)
const multer = require('multer');
const { AppError } = require('../utils/errors');

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) return cb(null, true);
    cb(new AppError('Можно загрузить только JPG, PNG, WEBP или PDF'));
  }
});

module.exports = upload;
