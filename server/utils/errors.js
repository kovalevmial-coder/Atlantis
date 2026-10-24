// Ошибка бизнес-правила: текст показывается пользователю, статус уходит в HTTP-ответ
class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
module.exports = { AppError };
