/**
 * WRAPPER для експорту функцій з оригінального файлу
 * Дозволяє використовувати функції в модульній структурі
 */

// Завантажуємо оригінальний файл
require('./HR_Bot_Complete_Ultimate.js');

// Експортуємо функції через глобальні змінні
// Це дозволяє використовувати їх в модульній структурі
module.exports = {
  // Функції будуть доступні через глобальні змінні після завантаження файлу
  // Використовуємо eval для доступу до функцій (небезпечно, але для внутрішнього використання)
  get processMessage() {
    return global.processMessage || (() => {});
  },
  get processCallback() {
    return global.processCallback || (() => {});
  },
  get sendMessage() {
    return global.sendMessage || (() => {});
  },
  get getUserInfo() {
    return global.getUserInfo || (() => {});
  },
  get getUserRole() {
    return global.getUserRole || (() => {});
  },
  get showMainMenu() {
    return global.showMainMenu || (() => {});
  },
  get showWelcomeMessage() {
    return global.showWelcomeMessage || (() => {});
  },
  get handleReplyKeyboard() {
    return global.handleReplyKeyboard || (() => {});
  },
  get handleVacationProcess() {
    return global.handleVacationProcess || (() => {});
  },
  get handleLateProcess() {
    return global.handleLateProcess || (() => {});
  },
  get handleRemoteProcess() {
    return global.handleRemoteProcess || (() => {});
  },
  get handleSickProcess() {
    return global.handleSickProcess || (() => {});
  },
  get handleRegistrationStep() {
    return global.handleRegistrationStep || (() => {});
  },
  get handleHRMailing() {
    return global.handleHRMailing || (() => {});
  },
  get showHRDashboardStats() {
    return global.showHRDashboardStats || (() => {});
  }
};

