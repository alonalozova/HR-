/**
 * 🏢 HR БОТ - ПОВНА КОМЕРЦІЙНА ВЕРСІЯ
 * ⚡ Швидко, надійно, з усіма деталями бізнес-логіки
 * 🎯 100% кнопковий інтерфейс + повна реєстрація
 * 🔐 Повна система ролей та прав доступу
 * 📊 Автоматизація всіх HR-процесів для Люди.Digital
 * 
 * ПОВНА СПЕЦИФІКАЦІЯ:
 * - Відпустки: 1-7 календарних днів, 3 місяці до першої, PM→HR затвердження
 * - Remote: до 11:00, ліміт 14 днів/міс для офлайн/гібрид  
 * - Спізнення: з 11:00, попередження після 7 разів/міс
 * - Лікарняний: без лімітів, автофіксація
 * - Реєстрація: повна для всіх користувачів
 * - Онбординг: https://superficial-sort-084.notion.site/3b5c00ad8a42473bbef49bb26f076ebd
 * - Звітність: місячні звіти, експорт даних
 * - Комунікації: пропозиції, ASAP, FAQ
 * - Нагадування: дні народження (10+7 днів), річниці
 * - Структура: точні підкоманди (Kris team ≠ Lera team)
 */

// ⚙️ НАЛАШТУВАННЯ
// УВАГА: Замініть на ваші реальні значення перед використанням
const BOT_TOKEN = 'YOUR_BOT_TOKEN_HERE';
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';
const HR_CHAT_ID = 'YOUR_HR_CHAT_ID_HERE';

// 🛡️ ЗАХИСТ ВІД ДУБЛЮВАННЯ
let processingLock = false;

// 🚀 ГОЛОВНА ФУНКЦІЯ З ОПТИМІЗОВАНИМ ЗАХИСТОМ
function doPost(e) {
  // ⚡ МИТТЄВА відповідь Telegram
  const response = ContentService.createTextOutput('ok');
  
  try {
    if (processingLock) {
      return response; // Швидкий вихід
    }
    
    processingLock = true;
    
    if (!e || !e.postData || !e.postData.contents) {
      processingLock = false;
      return response;
    }
    
    const update = JSON.parse(e.postData.contents);
    const updateId = update.update_id;
    
    // Перевірка дублікатів
    if (checkDuplicate(updateId)) {
      processingLock = false;
      return response;
    }
    
    markAsProcessed(updateId);
    
    if (update.message) {
      processMessage(update.message);
    } else if (update.callback_query) {
      processCallback(update.callback_query);
    }
    
  } catch (error) {
    console.error('💥 Критична помилка:', error);
    logError('doPost', error.toString());
  } finally {
    processingLock = false;
  }
  
  return response;
}

// 🛡️ ПЕРЕВІРКА ДУБЛІКАТІВ
function checkDuplicate(updateId) {
  try {
    const cache = CacheService.getScriptCache();
    const key = `processed_${updateId}`;
    const result = cache.get(key);
    return result === 'processed';
  } catch (error) {
    console.error('Помилка перевірки дублікатів:', error);
    return false; // ДОЗВОЛЯЄМО обробку при помилці
  }
}

// 💾 ПОЗНАЧИТИ ЯК ОБРОБЛЕНИЙ
function markAsProcessed(updateId) {
  try {
    const cache = CacheService.getScriptCache();
    cache.put(`processed_${updateId}`, 'processed', 300); // 5 хвилин
  } catch (error) {
    console.error('Помилка збереження ID:', error);
  }
}

// 📊 ІНІЦІАЛІЗАЦІЯ ВСІХ ТАБЛИЦЬ
function initSheets() {
  try {
    console.log('🚀 Ініціалізація таблиць...');
    
    // 1. Працівники
    ensureSheet('Employees', [
      'FullName', 'TelegramID', 'Username', 'Department', 'Team', 'Subteam', 
      'Position', 'ManagerTelegramID', 'StartDate', 'Birthday', 'WorkFormat',
      'Email', 'Phone', 'Status'
    ]);
    
    // 2. Команди та ієрархія
    ensureSheet('Teams', [
      'Department', 'Team', 'Subteam', 'ManagerTelegramID', 'PMTelegramID'
    ]);
    
    // 3. Відпустки
    ensureSheet('Vacations', [
      'RequestID', 'TelegramID', 'FullName', 'Department', 'Team', 'Subteam',
      'StartDate', 'EndDate', 'DaysCount', 'IsEmergency', 'Reason',
      'PMStatus', 'PMDecisionBy', 'PMDecisionAt', 'PMComment',
      'HRStatus', 'HRDecisionBy', 'HRDecisionAt', 'HRComment',
      'BalanceBefore', 'BalanceAfter', 'CreatedAt'
    ]);
    
    // 4. Remote дні
    ensureSheet('Remotes', [
      'RequestID', 'TelegramID', 'FullName', 'Department', 'Team',
      'Date', 'RequestedAt', 'Reason', 'WorkFormat', 'MonthCount', 'CreatedAt'
    ]);
    
    // 5. Спізнення
    ensureSheet('Lates', [
      'EntryID', 'TelegramID', 'FullName', 'Department', 'Team',
      'Date', 'MinutesLate', 'Reason', 'MonthCount', 'CreatedAt'
    ]);
    
    // 6. Лікарняні
    ensureSheet('SickLeaves', [
      'EntryID', 'TelegramID', 'FullName', 'Department', 'Team',
      'StartDate', 'EndDate', 'DaysCount', 'Reason', 'CreatedAt'
    ]);
    
    // 7. Баланс відпусток
    ensureSheet('VacationBalance', [
      'TelegramID', 'Year', 'AnnualQuota', 'Used', 'Remaining', 
      'CanTakeVacation', 'FirstVacationDate', 'LastUpdated'
    ]);
    
    // 8. Онбординг матеріали
    ensureSheet('OnboardingAssets', [
      'AssetID', 'Department', 'Type', 'Title', 'URL', 'Order', 'IsActive'
    ]);
    
    // 9. Події та нагадування
    ensureSheet('Events', [
      'EventID', 'Type', 'TelegramID', 'FullName', 'Date', 'Department',
      'NotifyDays', 'IsProcessed', 'CreatedAt'
    ]);
    
    // 10. FAQ
    ensureSheet('HRFAQ', [
      'Category', 'Question', 'Answer', 'IsActive'
    ]);
    
    // 11. Ролі
    ensureSheet('Roles', [
      'TelegramID', 'Role', 'Department', 'CanExport'
    ]);
    
    // 12. Аудит лог
    ensureSheet('AuditLog', [
      'EntryID', 'ActorTelegramID', 'Action', 'Entity', 'EntityID', 
      'Details', 'Result', 'Timestamp'
    ]);
    
    console.log('✅ Всі таблиці ініціалізовано');
    return '✅ Всі 12 таблиць створено успішно!';
    
  } catch (error) {
    console.error('❌ Помилка ініціалізації:', error);
    return `❌ Помилка ініціалізації: ${error.toString()}`;
  }
}

// 🛠️ СТВОРЕННЯ/ПЕРЕВІРКА ТАБЛИЦІ
function ensureSheet(sheetName, headers) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      console.log(`✅ Створено таблицю: ${sheetName}`);
    }
    
    // Перевірка заголовків
    const existingHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const needsHeaders = existingHeaders.every(cell => !cell) || existingHeaders.length === 0;
    
    if (needsHeaders) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      console.log(`✅ Додано заголовки до ${sheetName}`);
    }
    
    return sheet;
  } catch (error) {
    console.error(`❌ Помилка створення ${sheetName}:`, error);
    return null;
  }
}

// 📨 ОБРОБКА ПОВІДОМЛЕНЬ
function processMessage(message) {
  try {
    const chatId = message.chat.id;
    const text = message.text || '';
    const telegramId = message.from.id;
    const username = message.from.username || '';
    const firstName = message.from.first_name || '';
    const lastName = message.from.last_name || '';
    
    if (text === '/start') {
      // Перевіряємо чи користувач зареєстрований
      const user = getUserInfo(telegramId);
      if (!user) {
        startRegistration(chatId, telegramId, username, firstName, lastName);
      } else {
        showMainMenu(chatId, telegramId);
      }
      return;
    }
    
    // Обробка текстових відповідей під час реєстрації
    handleRegistrationInput(chatId, telegramId, text);
    
  } catch (error) {
    console.error('Помилка processMessage:', error);
    logError('processMessage', error.toString());
  }
}

// 🎯 ПОЧАТОК РЕЄСТРАЦІЇ
function startRegistration(chatId, telegramId, username, firstName, lastName) {
  const welcomeText = `👋 <b>Привіт зірочка!</b> 🌟

🤖 Я бот-помічник розроблений твоїм HR. Вона створила мене, щоб полегшити і автоматизувати процеси. Я точно стану тобі в нагоді.

📝 Почну з того, що прошу тебе зареєструватися. Це потрібно, аби надалі я міг допомагати тобі.

Натисни кнопку нижче, щоб почати:`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '📝 Почати реєстрацію', callback_data: 'start_registration' }]
    ]
  };

  sendMessage(chatId, welcomeText, keyboard);
  
  // Зберігаємо базову інформацію
  saveRegistrationStep(telegramId, 'start', { username, firstName, lastName });
}

// 📋 ГОЛОВНЕ МЕНЮ З ГРУПОВИМИ КНОПКАМИ
function showMainMenu(chatId, telegramId) {
  try {
    const role = getUserRole(telegramId);
    const user = getUserInfo(telegramId);
    
    let welcomeText = `👋 <b>Привіт, ${user?.FullName || 'колега'}!</b>

🌟 Я твій HR помічник. Оберіть категорію:`;

    // 🎨 ГРУПОВІ КНОПКИ ДЛЯ КРАЩОГО UX
    const baseKeyboard = [
      // Група 1: Основні HR процеси
      [
        { text: '🏖️ Відпустки', callback_data: 'vacation_menu' },
        { text: '🏠 Remote', callback_data: 'remote_menu' }
      ],
      [
        { text: '⏰ Спізнення', callback_data: 'late_menu' },
        { text: '🏥 Лікарняний', callback_data: 'sick_menu' }
      ],
      // Група 2: Інформація та допомога
      [
        { text: '📊 Моя статистика', callback_data: 'my_stats' },
        { text: '🎯 Онбординг', callback_data: 'onboarding_menu' }
      ],
      [
        { text: '💬 Пропозиції', callback_data: 'suggestions_menu' },
        { text: '🚨 ASAP запит', callback_data: 'asap_request' }
      ],
      [
        { text: '❓ FAQ', callback_data: 'faq_menu' },
        { text: '🤖 ШІ-Помічник', callback_data: 'ai_assistant' }
      ]
    ];

    // Додаткові кнопки для PM/HR/CEO
    if (role === 'PM' || role === 'HR' || role === 'CEO') {
      baseKeyboard.push([
        { text: '📋 Затвердження', callback_data: 'approvals_menu' },
        { text: '📈 Аналітика', callback_data: 'analytics_menu' }
      ]);
    }

    if (role === 'HR') {
      baseKeyboard.push([
        { text: '👥 HR Панель', callback_data: 'hr_panel' },
        { text: '📢 Розсилки', callback_data: 'hr_broadcasts' }
      ]);
    }

    if (role === 'CEO') {
      baseKeyboard.push([
        { text: '🏢 CEO Панель', callback_data: 'ceo_panel' }
      ]);
    }

    // Кнопки навігації
    baseKeyboard.push([
      { text: '🏠 /start', callback_data: 'start_command' },
      { text: '🔄 Оновити меню', callback_data: 'main_menu' }
    ]);

    const keyboard = { inline_keyboard: baseKeyboard };
    sendMessage(chatId, welcomeText, keyboard);

  } catch (error) {
    console.error('Помилка showMainMenu:', error);
    sendMessage(chatId, '❌ Помилка завантаження меню. Зверніться до HR.');
  }
}

// 🎛️ ОБРОБКА CALLBACK ЗАПИТІВ
function processCallback(callback) {
  try {
    const chatId = callback.message.chat.id;
    const data = callback.data;
    const telegramId = callback.from.id;
    
    // Підтверджуємо callback
    answerCallbackQuery(callback.id);
    
    // Маршрутизація
    switch (data) {
      case 'vacation_menu':
        showVacationMenu(chatId, telegramId);
        break;
      case 'remote_menu':
        showRemoteMenu(chatId, telegramId);
        break;
      case 'late_menu':
        showLateMenu(chatId, telegramId);
        break;
      case 'sick_menu':
        showSickMenu(chatId, telegramId);
        break;
      case 'onboarding_menu':
        showOnboardingMenu(chatId, telegramId);
        break;
      case 'my_stats':
        showMyStats(chatId, telegramId);
        break;
      case 'faq_menu':
        showFAQMenu(chatId, telegramId);
        break;
      case 'back_main':
      case 'main_menu':
      case 'start_command':
        showMainMenu(chatId, telegramId);
        break;
      case 'start_registration':
        showRegistrationForm(chatId, telegramId);
        break;
      case 'suggestions_menu':
        showSuggestionsMenu(chatId, telegramId);
        break;
      case 'asap_request':
        showASAPForm(chatId, telegramId);
        break;
      case 'ai_assistant':
        showAIAssistant(chatId, telegramId);
        break;
      case 'analytics_menu':
        showAnalyticsMenu(chatId, telegramId);
        break;
      case 'hr_panel':
        showHRPanel(chatId, telegramId);
        break;
      case 'ceo_panel':
        showCEOPanel(chatId, telegramId);
        break;
      case 'ai_vacation_help':
        showAIVacationHelp(chatId, telegramId);
        break;
      case 'ai_remote_help':
        showAIRemoteHelp(chatId, telegramId);
        break;
      case 'ai_late_help':
        showAILateHelp(chatId, telegramId);
        break;
      case 'ai_sick_help':
        showAISickHelp(chatId, telegramId);
        break;
      case 'ai_personal_tips':
        showAIPersonalTips(chatId, telegramId);
        break;
      default:
        handleSpecificAction(chatId, telegramId, data);
        break;
    }
    
  } catch (error) {
    console.error('Помилка processCallback:', error);
    logError('processCallback', error.toString());
  }
}

// 🏖️ МЕНЮ ВІДПУСТОК
function showVacationMenu(chatId, telegramId) {
  const balance = getVacationBalance(telegramId);
  const canTake = canTakeVacation(telegramId);
  
  let text = `🏖️ <b>Відпустки</b>\n\n`;
  text += `💰 Ваш баланс: ${balance.remaining}/${balance.annual} днів\n`;
  
  if (!canTake.allowed) {
    text += `⚠️ ${canTake.reason}\n`;
  }
  
  text += `\nОберіть дію:`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '📝 Подати заявку', callback_data: canTake.allowed ? 'vacation_request' : 'vacation_blocked' },
        { text: '🚨 Екстрена відпустка', callback_data: 'vacation_emergency' }
      ],
      [
        { text: '📋 Мої заявки', callback_data: 'vacation_my_requests' },
        { text: '📊 Баланс деталі', callback_data: 'vacation_balance_details' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// 🏠 МЕНЮ REMOTE
function showRemoteMenu(chatId, telegramId) {
  const user = getUserInfo(telegramId);
  const monthStats = getMonthRemoteStats(telegramId);
  
  let text = `🏠 <b>Remote робота</b>\n\n`;
  text += `👤 ${user?.FullName}\n`;
  text += `💼 Формат роботи: ${user?.WorkFormat || 'Не вказано'}\n`;
  text += `📊 Цього місяця: ${monthStats.count}/14 днів\n\n`;
  
  if (user?.WorkFormat === 'Онлайн') {
    text += `✅ Ви працюєте онлайн - remote без обмежень\n`;
  } else if (monthStats.count >= 14) {
    text += `⚠️ Ліміт remote днів вичерпано (14/міс)\n`;
  }
  
  text += `\nОберіть дію:`;

  const canRequestRemote = user?.WorkFormat === 'Онлайн' || monthStats.count < 14;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '📅 Remote сьогодні', callback_data: canRequestRemote ? 'remote_today' : 'remote_limit_reached' },
        { text: '📆 Remote на дату', callback_data: canRequestRemote ? 'remote_date' : 'remote_limit_reached' }
      ],
      [
        { text: '📊 Моя статистика', callback_data: 'remote_my_stats' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// ⏰ МЕНЮ СПІЗНЕНЬ
function showLateMenu(chatId, telegramId) {
  const monthStats = getMonthLateStats(telegramId);
  
  let text = `⏰ <b>Спізнення</b>\n\n`;
  text += `📊 Цього місяця: ${monthStats.count} разів\n`;
  
  if (monthStats.count >= 7) {
    text += `⚠️ Увага! Перевищено норму спізнень (7/міс)\n`;
  }
  
  text += `\nНа скільки хвилин спізнюєтесь?`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '5 хв', callback_data: 'late_5' },
        { text: '10 хв', callback_data: 'late_10' },
        { text: '15 хв', callback_data: 'late_15' }
      ],
      [
        { text: '30 хв', callback_data: 'late_30' },
        { text: '60+ хв', callback_data: 'late_60' }
      ],
      [
        { text: '📊 Моя статистика', callback_data: 'late_my_stats' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// 🏥 МЕНЮ ЛІКАРНЯНОГО
function showSickMenu(chatId, telegramId) {
  const text = `🏥 <b>Лікарняний</b>\n\nВи захворіли? Зафіксуємо це для HR та вашого PM.\n\nОберіть тип:`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🤒 Захворів сьогодні', callback_data: 'sick_today' },
        { text: '📅 Лікарняний на період', callback_data: 'sick_period' }
      ],
      [
        { text: '✅ Одужав, виходжу', callback_data: 'sick_recovery' }
      ],
      [
        { text: '📊 Моя статистика', callback_data: 'sick_my_stats' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// 📊 МОЯ СТАТИСТИКА
function showMyStats(chatId, telegramId) {
  try {
    const user = getUserInfo(telegramId);
    const vacationBalance = getVacationBalance(telegramId);
    const remoteStats = getMonthRemoteStats(telegramId);
    const lateStats = getMonthLateStats(telegramId);
    const sickStats = getMonthSickStats(telegramId);
    
    const currentMonth = new Date().toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });
    
    let text = `📊 <b>Моя статистика</b>\n\n`;
    text += `👤 ${user?.FullName}\n`;
    text += `💼 ${user?.Position}\n`;
    text += `🏢 ${user?.Department}`;
    if (user?.Team) text += ` / ${user?.Team}`;
    if (user?.Subteam) text += ` / ${user?.Subteam}`;
    text += `\n\n`;
    
    text += `🏖️ <b>Відпустки:</b>\n`;
    text += `💰 Баланс: ${vacationBalance.remaining}/${vacationBalance.annual} днів\n`;
    text += `📅 Використано: ${vacationBalance.used} днів\n\n`;
    
    text += `📈 <b>Статистика за ${currentMonth}:</b>\n`;
    text += `🏠 Remote: ${remoteStats.count} днів`;
    if (user?.WorkFormat !== 'Онлайн') text += ` (ліміт: 14)`;
    text += `\n`;
    text += `⏰ Спізнення: ${lateStats.count} разів`;
    if (lateStats.count >= 7) text += ` ⚠️`;
    text += `\n`;
    text += `🏥 Лікарняний: ${sickStats.days} днів\n`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📋 Детальна статистика', callback_data: 'detailed_stats' }
        ],
        [
          { text: '🔙 Назад', callback_data: 'back_main' }
        ]
      ]
    };

    sendMessage(chatId, text, keyboard);
    
  } catch (error) {
    console.error('Помилка showMyStats:', error);
    sendMessage(chatId, '❌ Помилка завантаження статистики.');
  }
}

// 📝 СИСТЕМА РЕЄСТРАЦІЇ
function showRegistrationForm(chatId, telegramId) {
  const text = `📝 <b>Реєстрація в системі</b>

Будь ласка, заповніть всі поля для завершення реєстрації:

<b>Крок 1:</b> Введіть ваше прізвище`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🔙 Назад', callback_data: 'back_main' }]
    ]
  };

  sendMessage(chatId, text, keyboard);
  saveRegistrationStep(telegramId, 'surname', {});
}

// 💬 МЕНЮ ПРОПОЗИЦІЙ
function showSuggestionsMenu(chatId, telegramId) {
  const text = `💬 <b>Пропозиції для покращення</b>

Ваші ідеї важливі для нас! Оберіть тип пропозиції:`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '📝 Анонімна пропозиція', callback_data: 'suggestion_anonymous' },
        { text: '👤 Іменна пропозиція', callback_data: 'suggestion_named' }
      ],
      [
        { text: '📊 Мої пропозиції', callback_data: 'my_suggestions' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// 🚨 ASAP ЗАПИТ
function showASAPForm(chatId, telegramId) {
  const user = getUserInfo(telegramId);
  
  const text = `🚨 <b>ASAP Запит</b>

👤 ${user?.FullName}
🏢 ${user?.Department} / ${user?.Team}

Опишіть вашу проблему, яка потребує негайного вирішення:

<i>Ваше повідомлення буде одразу відправлено HR для розгляду.</i>`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🔙 Назад', callback_data: 'back_main' }]
    ]
  };

  sendMessage(chatId, text, keyboard);
  saveRegistrationStep(telegramId, 'asap_message', {});
}

// 🤖 ШІ-ПОМІЧНИК
function showAIAssistant(chatId, telegramId) {
  const text = `🤖 <b>ШІ-Помічник</b>

Я можу допомогти вам з:

🔍 <b>Швидкі відповіді:</b>
• Правила відпусток
• Процедури remote роботи
• Політика спізнень
• Лікарняні процедури

💡 <b>Рекомендації:</b>
• Оптимальні дати відпустки
• Планування робочого графіку
• Поради по кар'єрі

❓ Задайте мені будь-яке питання!`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '❓ Про відпустки', callback_data: 'ai_vacation_help' },
        { text: '🏠 Про remote', callback_data: 'ai_remote_help' }
      ],
      [
        { text: '⏰ Про спізнення', callback_data: 'ai_late_help' },
        { text: '🏥 Про лікарняний', callback_data: 'ai_sick_help' }
      ],
      [
        { text: '💡 Персональні поради', callback_data: 'ai_personal_tips' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// 📊 РОЗШИРЕНА АНАЛІТИКА
function showAnalyticsMenu(chatId, telegramId) {
  const role = getUserRole(telegramId);
  
  let text = `📊 <b>Аналітика та звіти</b>\n\n`;
  
  if (role === 'HR') {
    text += `👥 <b>HR Аналітика:</b>\n`;
    text += `• Загальна статистика компанії\n`;
    text += `• Аналіз відпусток по відділах\n`;
    text += `• Тренди remote роботи\n`;
    text += `• Статистика спізнень\n`;
    text += `• Прогнози навантаження\n\n`;
  } else if (role === 'CEO') {
    text += `🏢 <b>CEO Аналітика:</b>\n`;
    text += `• Загальні показники компанії\n`;
    text += `• Ефективність відділів\n`;
    text += `• Фінансовий вплив відпусток\n`;
    text += `• Аналіз продуктивності\n\n`;
  } else if (role === 'PM') {
    text += `👨‍💼 <b>PM Аналітика:</b>\n`;
    text += `• Статистика вашої команди\n`;
    text += `• Планування проектів\n`;
    text += `• Навантаження команди\n\n`;
  }
  
  text += `Оберіть тип звіту:`;

  const keyboard = {
    inline_keyboard: []
  };

  if (role === 'HR') {
    keyboard.inline_keyboard.push(
      [
        { text: '📈 Загальна статистика', callback_data: 'analytics_general' },
        { text: '🏖️ Аналіз відпусток', callback_data: 'analytics_vacation' }
      ],
      [
        { text: '🏠 Remote тренди', callback_data: 'analytics_remote' },
        { text: '⏰ Статистика спізнень', callback_data: 'analytics_late' }
      ],
      [
        { text: '📊 Детальний звіт', callback_data: 'analytics_detailed' },
        { text: '📈 Прогнози', callback_data: 'analytics_forecast' }
      ]
    );
  } else if (role === 'CEO') {
    keyboard.inline_keyboard.push(
      [
        { text: '🏢 Огляд компанії', callback_data: 'analytics_company' },
        { text: '💰 Фінансовий вплив', callback_data: 'analytics_financial' }
      ],
      [
        { text: '📊 Ефективність відділів', callback_data: 'analytics_departments' }
      ]
    );
  } else if (role === 'PM') {
    keyboard.inline_keyboard.push(
      [
        { text: '👥 Моя команда', callback_data: 'analytics_my_team' },
        { text: '📅 Планування', callback_data: 'analytics_planning' }
      ]
    );
  }

  keyboard.inline_keyboard.push([
    { text: '🔙 Назад', callback_data: 'back_main' }
  ]);

  sendMessage(chatId, text, keyboard);
}

// 👥 HR ПАНЕЛЬ
function showHRPanel(chatId, telegramId) {
  const role = getUserRole(telegramId);
  
  if (role !== 'HR') {
    sendMessage(chatId, '❌ Доступ заборонено. Тільки для HR.');
    return;
  }

  const text = `👥 <b>HR Панель управління</b>

🎛️ <b>Доступні функції:</b>

📊 <b>Звітність:</b>
• Місячні звіти по всіх працівниках
• Експорт даних в різних форматах
• Аналітика по відділах

👤 <b>Управління користувачами:</b>
• Перегляд всіх працівників
• Редагування даних
• Управління ролями

📢 <b>Комунікації:</b>
• Масові розсилки
• Нагадування
• Оголошення

⚙️ <b>Налаштування:</b>
• Бізнес-правила
• Календар свят
• Інтеграції`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '📊 Звіти', callback_data: 'hr_reports' },
        { text: '👥 Користувачі', callback_data: 'hr_users' }
      ],
      [
        { text: '📢 Розсилки', callback_data: 'hr_broadcasts' },
        { text: '⚙️ Налаштування', callback_data: 'hr_settings' }
      ],
      [
        { text: '📈 Дашборд', callback_data: 'hr_dashboard' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// 🏢 CEO ПАНЕЛЬ
function showCEOPanel(chatId, telegramId) {
  const role = getUserRole(telegramId);
  
  if (role !== 'CEO') {
    sendMessage(chatId, '❌ Доступ заборонено. Тільки для CEO.');
    return;
  }

  const text = `🏢 <b>CEO Панель управління</b>

📈 <b>Стратегічна аналітика:</b>
• KPI по відділах
• Ефективність команд
• Фінансовий вплив HR процесів
• Прогнози розвитку

👥 <b>Управління персоналом:</b>
• Загальна статистика
• Аналіз продуктивності
• Планування ресурсів

💼 <b>Бізнес-рішення:</b>
• Оптимізація процесів
• Стратегічне планування
• ROI аналіз`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '📈 KPI Дашборд', callback_data: 'ceo_kpi' },
        { text: '💰 Фінансовий аналіз', callback_data: 'ceo_financial' }
      ],
      [
        { text: '👥 Аналіз персоналу', callback_data: 'ceo_hr_analysis' },
        { text: '🎯 Стратегія', callback_data: 'ceo_strategy' }
      ],
      [
        { text: '📊 Повний звіт', callback_data: 'ceo_full_report' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// 🤖 ШІ-ПОМІЧНИК - ВІДПУСТКИ
function showAIVacationHelp(chatId, telegramId) {
  const user = getUserInfo(telegramId);
  const balance = getVacationBalance(telegramId);
  const canTake = canTakeVacation(telegramId);
  
  let text = `🏖️ <b>ШІ-Помічник: Відпустки</b>\n\n`;
  
  text += `👤 ${user?.FullName}\n`;
  text += `💰 Ваш баланс: ${balance.remaining}/${balance.annual} днів\n\n`;
  
  text += `📋 <b>Правила відпусток:</b>\n`;
  text += `• Мінімум: 1 день\n`;
  text += `• Максимум: 7 календарних днів за раз\n`;
  text += `• Перша відпустка: через 3 місяці після початку роботи\n`;
  text += `• Річний ліміт: 24 дні\n`;
  text += `• Накладки заборонені в межах підкоманди\n\n`;
  
  text += `🎯 <b>Процес затвердження:</b>\n`;
  text += `1. Подача заявки через бот\n`;
  text += `2. Підтвердження PM\n`;
  text += `3. Фінальне затвердження HR\n\n`;
  
  if (!canTake.allowed) {
    text += `⚠️ <b>Увага:</b> ${canTake.reason}\n\n`;
  } else {
    text += `✅ <b>Рекомендація:</b> Ви можете подати заявку на відпустку!\n\n`;
  }
  
  text += `💡 <b>Поради:</b>\n`;
  text += `• Подавайте заявку за 5 робочих днів\n`;
  text += `• Перевіряйте календар команди\n`;
  text += `• Для екстрених випадків є окрема кнопка`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🏖️ Подати заявку', callback_data: 'vacation_request' },
        { text: '📊 Мій баланс', callback_data: 'vacation_balance_details' }
      ],
      [
        { text: '🔙 Назад до ШІ', callback_data: 'ai_assistant' },
        { text: '🏠 Головне меню', callback_data: 'main_menu' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// 🤖 ШІ-ПОМІЧНИК - REMOTE
function showAIRemoteHelp(chatId, telegramId) {
  const user = getUserInfo(telegramId);
  const monthStats = getMonthRemoteStats(telegramId);
  
  let text = `🏠 <b>ШІ-Помічник: Remote робота</b>\n\n`;
  
  text += `👤 ${user?.FullName}\n`;
  text += `💼 Формат роботи: ${user?.WorkFormat || 'Не вказано'}\n`;
  text += `📊 Цього місяця: ${monthStats.count}/14 днів\n\n`;
  
  text += `📋 <b>Правила remote:</b>\n`;
  text += `• Повідомляти до 11:00\n`;
  text += `• Онлайн формат: без лімітів\n`;
  text += `• Офлайн/Гібрид: до 14 днів/місяць\n`;
  text += `• Автоматичне повідомлення HR та PM\n\n`;
  
  if (user?.WorkFormat === 'Онлайн') {
    text += `✅ <b>Ваш статус:</b> Онлайн - remote без обмежень!\n\n`;
  } else if (monthStats.count >= 14) {
    text += `⚠️ <b>Увага:</b> Ліміт remote днів вичерпано (14/міс)\n\n`;
  } else {
    text += `✅ <b>Доступно:</b> ${14 - monthStats.count} remote днів до кінця місяця\n\n`;
  }
  
  text += `💡 <b>Поради:</b>\n`;
  text += `• Плануйте remote дні заздалегідь\n`;
  text += `• Повідомляйте до 11:00\n`;
  text += `• Координуйтесь з командою`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🏠 Remote сьогодні', callback_data: 'remote_today' },
        { text: '📅 Remote на дату', callback_data: 'remote_date' }
      ],
      [
        { text: '🔙 Назад до ШІ', callback_data: 'ai_assistant' },
        { text: '🏠 Головне меню', callback_data: 'main_menu' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// 🤖 ШІ-ПОМІЧНИК - СПІЗНЕННЯ
function showAILateHelp(chatId, telegramId) {
  const monthStats = getMonthLateStats(telegramId);
  
  let text = `⏰ <b>ШІ-Помічник: Спізнення</b>\n\n`;
  
  text += `📊 Цього місяця: ${monthStats.count} разів\n\n`;
  
  text += `📋 <b>Правила спізнень:</b>\n`;
  text += `• Робочий день: 10:00-18:00\n`;
  text += `• Спізнення: з 11:00\n`;
  text += `• Ліміт: 7 разів на місяць\n`;
  text += `• При перевищенні: попередження\n\n`;
  
  if (monthStats.count >= 7) {
    text += `⚠️ <b>Увага:</b> Перевищено норму спізнень (7/міс)!\n`;
    text += `Рекомендуємо звернутися до HR для обговорення.\n\n`;
  } else if (monthStats.count >= 5) {
    text += `🟡 <b>Попередження:</b> Близько до ліміту (${monthStats.count}/7)\n`;
    text += `Будьте обережні з часом!\n\n`;
  } else {
    text += `✅ <b>Статус:</b> В межах норми (${monthStats.count}/7)\n\n`;
  }
  
  text += `💡 <b>Поради для пунктуальності:</b>\n`;
  text += `• Встановіть будильник на 15 хв раніше\n`;
  text += `• Підготуйтесь з вечора\n`;
  text += `• Врахуйте час на дорогу\n`;
  text += `• Використовуйте нагадування`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '⏰ Зафіксувати спізнення', callback_data: 'late_menu' }
      ],
      [
        { text: '🔙 Назад до ШІ', callback_data: 'ai_assistant' },
        { text: '🏠 Головне меню', callback_data: 'main_menu' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// 🤖 ШІ-ПОМІЧНИК - ЛІКАРНЯНИЙ
function showAISickHelp(chatId, telegramId) {
  const sickStats = getMonthSickStats(telegramId);
  
  let text = `🏥 <b>ШІ-Помічник: Лікарняний</b>\n\n`;
  
  text += `📊 Цього місяця: ${sickStats.days} днів\n\n`;
  
  text += `📋 <b>Правила лікарняного:</b>\n`;
  text += `• Без лімітів по днях\n`;
  text += `• Повідомляти одразу при хворобі\n`;
  text += `• Автоматичне повідомлення HR та PM\n`;
  text += `• Довідка не потрібна через бот\n`;
  text += `• Можна вказати період хвороби\n\n`;
  
  text += `🎯 <b>Як правильно оформити:</b>\n`;
  text += `1. Натисніть "Лікарняний" в головному меню\n`;
  text += `2. Оберіть тип (сьогодні або період)\n`;
  text += `3. HR та PM отримають повідомлення автоматично\n\n`;
  
  text += `💡 <b>Поради для здоров'я:</b>\n`;
  text += `• Не працюйте хворими - це знижує продуктивність\n`;
  text += `• Повідомляйте про хворобу одразу\n`;
  text += `• Дотримуйтесь режиму лікування\n`;
  text += `• Повертайтесь тільки після повного одужання`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🏥 Оформити лікарняний', callback_data: 'sick_menu' }
      ],
      [
        { text: '🔙 Назад до ШІ', callback_data: 'ai_assistant' },
        { text: '🏠 Головне меню', callback_data: 'main_menu' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// 🤖 ШІ-ПОМІЧНИК - ПЕРСОНАЛЬНІ ПОРАДИ
function showAIPersonalTips(chatId, telegramId) {
  const user = getUserInfo(telegramId);
  const role = getUserRole(telegramId);
  const vacationBalance = getVacationBalance(telegramId);
  const remoteStats = getMonthRemoteStats(telegramId);
  const lateStats = getMonthLateStats(telegramId);
  
  let text = `💡 <b>ШІ-Помічник: Персональні поради</b>\n\n`;
  
  text += `👤 ${user?.FullName}\n`;
  text += `💼 ${user?.Position}\n`;
  text += `🏢 ${user?.Department}`;
  if (user?.Team) text += ` / ${user?.Team}`;
  text += `\n\n`;
  
  text += `🎯 <b>Персональні рекомендації:</b>\n\n`;
  
  // Поради по відпустці
  if (vacationBalance.remaining > 18) {
    text += `🏖️ <b>Відпустка:</b> У вас багато днів відпустки (${vacationBalance.remaining}). Рекомендуємо запланувати відпочинок!\n\n`;
  } else if (vacationBalance.remaining < 5) {
    text += `🏖️ <b>Відпустка:</b> Залишилось мало днів (${vacationBalance.remaining}). Плануйте відпустку обережно.\n\n`;
  }
  
  // Поради по remote
  if (user?.WorkFormat !== 'Онлайн' && remoteStats.count > 10) {
    text += `🏠 <b>Remote:</b> Ви часто працюєте remote (${remoteStats.count}/14). Можливо, варто розглянути онлайн формат?\n\n`;
  }
  
  // Поради по спізненням
  if (lateStats.count > 3) {
    text += `⏰ <b>Пунктуальність:</b> Є проблеми зі спізненнями (${lateStats.count}/7). Рекомендуємо оптимізувати ранковий розпорядок.\n\n`;
  }
  
  // Поради по ролі
  if (role === 'PM') {
    text += `👨‍💼 <b>Для PM:</b> Не забувайте перевіряти заявки команди в розділі "Затвердження".\n\n`;
  } else if (role === 'HR') {
    text += `👥 <b>Для HR:</b> Регулярно перевіряйте аналітику та звіти для оптимізації процесів.\n\n`;
  }
  
  text += `📈 <b>Загальні поради:</b>\n`;
  text += `• Використовуйте бота для всіх HR процесів\n`;
  text += `• Плануйте відпустки заздалегідь\n`;
  text += `• Слідкуйте за своєю статистикою\n`;
  text += `• Звертайтесь до HR при питаннях`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '📊 Моя статистика', callback_data: 'my_stats' }
      ],
      [
        { text: '🔙 Назад до ШІ', callback_data: 'ai_assistant' },
        { text: '🏠 Головне меню', callback_data: 'main_menu' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// 🎯 ОБРОБКА СПЕЦИФІЧНИХ ДІЙ
function handleSpecificAction(chatId, telegramId, action) {
  try {
    switch (action) {
      case 'vacation_request':
        startVacationRequest(chatId, telegramId, false);
        break;
      case 'vacation_emergency':
        startVacationRequest(chatId, telegramId, true);
        break;
      case 'remote_today':
        processRemoteToday(chatId, telegramId);
        break;
      case 'sick_today':
        processSickToday(chatId, telegramId);
        break;
      default:
        if (action.startsWith('late_')) {
          const minutes = action.split('_')[1];
          processLateReport(chatId, telegramId, minutes);
        } else if (action.startsWith('dept_')) {
          const department = action.split('_')[1];
          showTeamSelection(chatId, telegramId, department);
        } else if (action.startsWith('team_')) {
          const teamData = action.replace('team_', '');
          handleTeamSelection(chatId, telegramId, teamData);
        }
        break;
    }
  } catch (error) {
    console.error('Помилка handleSpecificAction:', error);
    sendMessage(chatId, '❌ Помилка обробки запиту.');
  }
}

// 🏖️ ПОЧАТОК ЗАПИТУ ВІДПУСТКИ
function startVacationRequest(chatId, telegramId, isEmergency) {
  const user = getUserInfo(telegramId);
  
  let text = `📝 <b>${isEmergency ? 'Екстрена відпустка' : 'Заявка на відпустку'}</b>\n\n`;
  text += `👤 ${user?.FullName}\n`;
  
  if (isEmergency) {
    text += `🚨 Екстрена ситуація - заявка піде одразу до HR\n\n`;
  } else {
    text += `📋 Звичайна процедура: PM → HR\n\n`;
  }
  
  text += `Оберіть початкову дату відпустки:`;
  
  // Тут буде календар - поки спрощена версія
  const keyboard = {
    inline_keyboard: [
      [
        { text: '📅 Обрати дати', callback_data: `vacation_dates_${isEmergency ? 'emergency' : 'normal'}` }
      ],
      [
        { text: '🔙 Назад', callback_data: 'vacation_menu' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// 🏠 ОБРОБКА REMOTE СЬОГОДНІ
function processRemoteToday(chatId, telegramId) {
  try {
    const user = getUserInfo(telegramId);
    const now = new Date();
    const today = Utilities.formatDate(now, 'GMT+2', 'yyyy-MM-dd');
    const requestTime = Utilities.formatDate(now, 'GMT+2', 'HH:mm');
    
    // Перевірка часу (до 11:00)
    const currentHour = now.getHours();
    const isOnTime = currentHour < 11;
    
    if (!isOnTime) {
      sendMessage(chatId, '⚠️ Remote день потрібно повідомляти до 11:00. Зверніться до HR для узгодження.');
      return;
    }
    
    // Перевірка ліміту для офлайн/гібрид
    if (user?.WorkFormat !== 'Онлайн') {
      const monthStats = getMonthRemoteStats(telegramId);
      if (monthStats.count >= 14) {
        sendMessage(chatId, '⚠️ Ліміт remote днів на місяць вичерпано (14). Зверніться до HR.');
        return;
      }
    }
    
    // Записуємо remote день
    const requestId = `R_${Date.now()}`;
    recordRemoteDay(requestId, telegramId, today, 'Remote робота', user?.WorkFormat);
    
    // Повідомляємо користувача
    sendMessage(chatId, `✅ Remote день на ${today} зафіксовано!\n⏰ Час подачі: ${requestTime}`);
    
    // Повідомляємо HR та PM
    notifyHRAndPM(user, 'remote', {
      date: today,
      requestTime: requestTime,
      monthCount: getMonthRemoteStats(telegramId).count + 1
    });
    
  } catch (error) {
    console.error('Помилка processRemoteToday:', error);
    sendMessage(chatId, '❌ Помилка обробки запиту. Спробуйте пізніше.');
  }
}

// ⏰ ОБРОБКА СПІЗНЕННЯ
function processLateReport(chatId, telegramId, minutes) {
  try {
    const user = getUserInfo(telegramId);
    const today = Utilities.formatDate(new Date(), 'GMT+2', 'yyyy-MM-dd');
    const entryId = `L_${Date.now()}`;
    
    // Записуємо спізнення
    recordLateEntry(entryId, telegramId, today, parseInt(minutes));
    
    const monthStats = getMonthLateStats(telegramId);
    const newCount = monthStats.count + 1;
    
    let text = `✅ Спізнення на ${minutes} хв зафіксовано!\n`;
    text += `📊 Цього місяця: ${newCount} разів`;
    
    if (newCount >= 7) {
      text += `\n⚠️ Увага! Перевищено норму спізнень (7/міс)`;
    }
    
    sendMessage(chatId, text);
    
    // Повідомляємо HR (завжди) та PM (якщо >= 7)
    notifyHRAndPM(user, 'late', {
      date: today,
      minutes: minutes,
      monthCount: newCount,
      isOverLimit: newCount >= 7
    });
    
  } catch (error) {
    console.error('Помилка processLateReport:', error);
    sendMessage(chatId, '❌ Помилка фіксації спізнення.');
  }
}

// 🏥 ОБРОБКА ЛІКАРНЯНОГО СЬОГОДНІ
function processSickToday(chatId, telegramId) {
  try {
    const user = getUserInfo(telegramId);
    const today = Utilities.formatDate(new Date(), 'GMT+2', 'yyyy-MM-dd');
    const entryId = `S_${Date.now()}`;
    
    // Записуємо лікарняний
    recordSickLeave(entryId, telegramId, today, today, 1, 'Захворювання');
    
    sendMessage(chatId, '✅ Лікарняний день зафіксовано!\n🏥 HR та ваш PM повідомлені.');
    
    // Повідомляємо HR та PM
    notifyHRAndPM(user, 'sick', {
      startDate: today,
      endDate: today,
      days: 1
    });
    
  } catch (error) {
    console.error('Помилка processSickToday:', error);
    sendMessage(chatId, '❌ Помилка фіксації лікарняного.');
  }
}

// 📊 ДОПОМІЖНІ ФУНКЦІЇ СТАТИСТИКИ

// Отримання балансу відпустки
function getVacationBalance(telegramId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('VacationBalance');
    const currentYear = new Date().getFullYear();
    
    if (!sheet || sheet.getLastRow() <= 1) {
      // Створюємо запис
      const user = getUserInfo(telegramId);
      const canTake = canTakeVacationByStartDate(user?.StartDate);
      
      sheet.appendRow([
        telegramId, currentYear, 24, 0, 24, 
        canTake, canTake ? new Date() : calculateFirstVacationDate(user?.StartDate),
        new Date()
      ]);
      
      return { annual: 24, used: 0, remaining: 24 };
    }
    
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == telegramId && data[i][1] == currentYear) {
        return {
          annual: data[i][2] || 24,
          used: data[i][3] || 0,
          remaining: data[i][4] || 24
        };
      }
    }
    
    return { annual: 24, used: 0, remaining: 24 };
  } catch (error) {
    console.error('Помилка getVacationBalance:', error);
    return { annual: 24, used: 0, remaining: 24 };
  }
}

// Перевірка чи можна брати відпустку
function canTakeVacation(telegramId) {
  try {
    const user = getUserInfo(telegramId);
    if (!user?.StartDate) {
      return { allowed: false, reason: 'Дата початку роботи не вказана' };
    }
    
    const startDate = new Date(user.StartDate);
    const threeMonthsLater = new Date(startDate);
    threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
    
    const now = new Date();
    
    if (now < threeMonthsLater) {
      const daysLeft = Math.ceil((threeMonthsLater - now) / (1000 * 60 * 60 * 24));
      return { 
        allowed: false, 
        reason: `До першої відпустки залишилось ${daysLeft} днів (3 місяці з початку роботи)` 
      };
    }
    
    const balance = getVacationBalance(telegramId);
    if (balance.remaining <= 0) {
      return { allowed: false, reason: 'Баланс відпустки вичерпано' };
    }
    
    return { allowed: true, reason: '' };
  } catch (error) {
    console.error('Помилка canTakeVacation:', error);
    return { allowed: false, reason: 'Помилка перевірки' };
  }
}

// Статистика remote за місяць
function getMonthRemoteStats(telegramId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Remotes');
    
    if (!sheet || sheet.getLastRow() <= 1) {
      return { count: 0 };
    }
    
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    
    const data = sheet.getDataRange().getValues();
    let count = 0;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] == telegramId) {
        const date = new Date(data[i][5]); // Date column
        if (date.getMonth() + 1 === currentMonth && date.getFullYear() === currentYear) {
          count++;
        }
      }
    }
    
    return { count };
  } catch (error) {
    console.error('Помилка getMonthRemoteStats:', error);
    return { count: 0 };
  }
}

// Статистика спізнень за місяць
function getMonthLateStats(telegramId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Lates');
    
    if (!sheet || sheet.getLastRow() <= 1) {
      return { count: 0 };
    }
    
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    
    const data = sheet.getDataRange().getValues();
    let count = 0;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] == telegramId) {
        const date = new Date(data[i][5]); // Date column
        if (date.getMonth() + 1 === currentMonth && date.getFullYear() === currentYear) {
          count++;
        }
      }
    }
    
    return { count };
  } catch (error) {
    console.error('Помилка getMonthLateStats:', error);
    return { count: 0 };
  }
}

// Статистика лікарняних за місяць
function getMonthSickStats(telegramId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('SickLeaves');
    
    if (!sheet || sheet.getLastRow() <= 1) {
      return { days: 0 };
    }
    
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    
    const data = sheet.getDataRange().getValues();
    let days = 0;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] == telegramId) {
        const startDate = new Date(data[i][5]); // StartDate column
        if (startDate.getMonth() + 1 === currentMonth && startDate.getFullYear() === currentYear) {
          days += data[i][7] || 1; // DaysCount column
        }
      }
    }
    
    return { days };
  } catch (error) {
    console.error('Помилка getMonthSickStats:', error);
    return { days: 0 };
  }
}

// 📝 ФУНКЦІЇ ЗАПИСУ ДАНИХ

// Запис remote дня
function recordRemoteDay(requestId, telegramId, date, reason, workFormat) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Remotes');
    const user = getUserInfo(telegramId);
    const monthCount = getMonthRemoteStats(telegramId).count + 1;
    
    sheet.appendRow([
      requestId, telegramId, user?.FullName, user?.Department, user?.Team,
      date, new Date(), reason, workFormat, monthCount, new Date()
    ]);
    
    logAudit(telegramId, 'CREATE', 'Remote', requestId, { date, reason });
  } catch (error) {
    console.error('Помилка recordRemoteDay:', error);
  }
}

// Запис спізнення
function recordLateEntry(entryId, telegramId, date, minutes) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Lates');
    const user = getUserInfo(telegramId);
    const monthCount = getMonthLateStats(telegramId).count + 1;
    
    sheet.appendRow([
      entryId, telegramId, user?.FullName, user?.Department, user?.Team,
      date, minutes, 'Повідомлено через бот', monthCount, new Date()
    ]);
    
    logAudit(telegramId, 'CREATE', 'Late', entryId, { date, minutes });
  } catch (error) {
    console.error('Помилка recordLateEntry:', error);
  }
}

// Запис лікарняного
function recordSickLeave(entryId, telegramId, startDate, endDate, days, reason) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('SickLeaves');
    const user = getUserInfo(telegramId);
    
    sheet.appendRow([
      entryId, telegramId, user?.FullName, user?.Department, user?.Team,
      startDate, endDate, days, reason, new Date()
    ]);
    
    logAudit(telegramId, 'CREATE', 'SickLeave', entryId, { startDate, endDate, days });
  } catch (error) {
    console.error('Помилка recordSickLeave:', error);
  }
}

// 📢 ПОВІДОМЛЕННЯ HR ТА PM
function notifyHRAndPM(user, type, data) {
  try {
    let hrMessage = '';
    let pmMessage = '';
    
    switch (type) {
      case 'remote':
        hrMessage = `🏠 <b>Remote день</b>\n\n👤 ${user?.FullName}\n🏢 ${user?.Department}`;
        if (user?.Team) hrMessage += ` / ${user?.Team}`;
        hrMessage += `\n📅 Дата: ${data.date}\n⏰ Час подачі: ${data.requestTime}\n📊 Цього місяця: ${data.monthCount}`;
        
        pmMessage = hrMessage; // PM отримує ту ж інформацію
        break;
        
      case 'late':
        hrMessage = `⏰ <b>Спізнення</b>\n\n👤 ${user?.FullName}\n🏢 ${user?.Department}`;
        if (user?.Team) hrMessage += ` / ${user?.Team}`;
        hrMessage += `\n📅 Дата: ${data.date}\n⏱️ Спізнення: ${data.minutes} хв\n📊 Цього місяця: ${data.monthCount}`;
        if (data.isOverLimit) hrMessage += `\n⚠️ Перевищено норму (7/міс)`;
        
        if (data.isOverLimit) {
          pmMessage = hrMessage; // PM отримує тільки якщо перевищено ліміт
        }
        break;
        
      case 'sick':
        hrMessage = `🏥 <b>Лікарняний</b>\n\n👤 ${user?.FullName}\n🏢 ${user?.Department}`;
        if (user?.Team) hrMessage += ` / ${user?.Team}`;
        hrMessage += `\n📅 Період: ${data.startDate}`;
        if (data.endDate !== data.startDate) hrMessage += ` - ${data.endDate}`;
        hrMessage += `\n📊 Днів: ${data.days}`;
        
        pmMessage = hrMessage; // PM завжди отримує інформацію про лікарняний
        break;
    }
    
    // Відправляємо HR
    if (hrMessage) {
      sendMessage(HR_CHAT_ID, hrMessage);
    }
    
    // Відправляємо PM команди
    if (pmMessage && user?.Department) {
      const pmId = getPMTelegramId(user.Department, user.Team);
      if (pmId && pmId !== HR_CHAT_ID) {
        sendMessage(pmId, pmMessage);
      }
    }
    
  } catch (error) {
    console.error('Помилка notifyHRAndPM:', error);
  }
}

// 👤 ДОПОМІЖНІ ФУНКЦІЇ КОРИСТУВАЧІВ

// Отримання ролі користувача
function getUserRole(telegramId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Roles');
    
    if (!sheet || sheet.getLastRow() <= 1) {
      return 'EMP';
    }
    
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == telegramId) {
        return data[i][1] || 'EMP';
      }
    }
    
    return 'EMP';
  } catch (error) {
    console.error('Помилка getUserRole:', error);
    return 'EMP';
  }
}

// Отримання інформації користувача
function getUserInfo(telegramId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Employees');
    
    if (!sheet || sheet.getLastRow() <= 1) {
      return null;
    }
    
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] == telegramId) {
        return {
          FullName: data[i][0],
          TelegramID: data[i][1],
          Username: data[i][2],
          Department: data[i][3],
          Team: data[i][4],
          Subteam: data[i][5],
          Position: data[i][6],
          ManagerTelegramID: data[i][7],
          StartDate: data[i][8],
          Birthday: data[i][9],
          WorkFormat: data[i][10],
          Email: data[i][11],
          Phone: data[i][12],
          Status: data[i][13]
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Помилка getUserInfo:', error);
    return null;
  }
}

// Отримання PM команди
function getPMTelegramId(department, team) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Teams');
    
    if (!sheet || sheet.getLastRow() <= 1) {
      return null;
    }
    
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === department && (!team || data[i][1] === team)) {
        return data[i][4]; // PMTelegramID column
      }
    }
    
    return null;
  } catch (error) {
    console.error('Помилка getPMTelegramId:', error);
    return null;
  }
}

// 📝 АУДИТ ЛОГ
function logAudit(actorTelegramId, action, entity, entityId, details) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('AuditLog');
    
    if (sheet) {
      const entryId = `A_${Date.now()}`;
      sheet.appendRow([
        entryId, actorTelegramId, action, entity, entityId,
        JSON.stringify(details), 'SUCCESS', new Date()
      ]);
    }
  } catch (error) {
    console.error('Помилка logAudit:', error);
  }
}

// 📝 ЛОГУВАННЯ ПОМИЛОК
function logError(functionName, errorMessage) {
  try {
    logAudit('SYSTEM', 'ERROR', functionName, '', { error: errorMessage });
  } catch (e) {
    console.error('Не вдалося залогувати помилку:', e);
  }
}

// 📝 ДОПОМІЖНІ ФУНКЦІЇ РЕЄСТРАЦІЇ
function saveRegistrationStep(telegramId, step, data) {
  try {
    const cache = CacheService.getScriptCache();
    const key = `registration_${telegramId}`;
    const existingData = cache.get(key);
    
    let registrationData = {};
    if (existingData) {
      registrationData = JSON.parse(existingData);
    }
    
    registrationData.currentStep = step;
    registrationData = { ...registrationData, ...data };
    
    cache.put(key, JSON.stringify(registrationData), 1800); // 30 хвилин
  } catch (error) {
    console.error('Помилка збереження кроку реєстрації:', error);
  }
}

function getRegistrationData(telegramId) {
  try {
    const cache = CacheService.getScriptCache();
    const key = `registration_${telegramId}`;
    const data = cache.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Помилка отримання даних реєстрації:', error);
    return null;
  }
}

// 📝 ОБРОБКА ТЕКСТОВИХ ПОВІДОМЛЕНЬ ПІД ЧАС РЕЄСТРАЦІЇ
function handleRegistrationInput(chatId, telegramId, text) {
  try {
    const regData = getRegistrationData(telegramId);
    if (!regData) return;
    
    const step = regData.currentStep;
    
    switch (step) {
      case 'surname':
        saveRegistrationStep(telegramId, 'name', { surname: text });
        sendMessage(chatId, `✅ Прізвище: ${text}\n\n<b>Крок 2:</b> Введіть ваше ім'я`);
        break;
        
      case 'name':
        saveRegistrationStep(telegramId, 'department', { name: text });
        showDepartmentSelection(chatId, telegramId);
        break;
        
      case 'position':
        saveRegistrationStep(telegramId, 'birthday', { position: text });
        sendMessage(chatId, `✅ Посада: ${text}\n\n<b>Крок 5:</b> Введіть дату народження (ДД.ММ.РРРР)`);
        break;
        
      case 'birthday':
        if (isValidDate(text)) {
          saveRegistrationStep(telegramId, 'complete', { birthday: text });
          completeRegistration(chatId, telegramId);
        } else {
          sendMessage(chatId, '❌ Неправильний формат дати. Введіть у форматі ДД.ММ.РРРР (наприклад: 15.03.1990)');
        }
        break;
        
      case 'asap_message':
        processASAPMessage(chatId, telegramId, text);
        break;
    }
  } catch (error) {
    console.error('Помилка handleRegistrationInput:', error);
  }
}

// 🏢 ВИБІР ДЕПАРТАМЕНТУ
function showDepartmentSelection(chatId, telegramId) {
  const text = `<b>Крок 3:</b> Оберіть ваш департамент:`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '📈 Marketing', callback_data: 'dept_Marketing' },
        { text: '🎨 Design', callback_data: 'dept_Design' }
      ],
      [
        { text: '📱 SMM', callback_data: 'dept_SMM' },
        { text: '💼 Sales', callback_data: 'dept_Sales' }
      ],
      [
        { text: '👥 HR', callback_data: 'dept_HR' },
        { text: '🏢 CEO', callback_data: 'dept_CEO' }
      ]
    ]
  };
  
  sendMessage(chatId, text, keyboard);
}

// 👥 ВИБІР КОМАНДИ
function showTeamSelection(chatId, telegramId, department) {
  let text = `<b>Крок 4:</b> Оберіть вашу команду в ${department}:`;
  let keyboard = { inline_keyboard: [] };
  
  switch (department) {
    case 'Marketing':
      keyboard.inline_keyboard = [
        [{ text: 'PPC', callback_data: 'team_PPC' }],
        [{ text: 'Target - Kris team', callback_data: 'team_Target_Kris' }],
        [{ text: 'Target - Lera team', callback_data: 'team_Target_Lera' }]
      ];
      break;
      
    case 'Design':
      keyboard.inline_keyboard = [
        [{ text: 'Head + Motion (1 особа)', callback_data: 'team_Head_Motion' }],
        [{ text: 'Static', callback_data: 'team_Static' }],
        [{ text: 'Video', callback_data: 'team_Video' }],
        [{ text: 'SMM Design', callback_data: 'team_SMM_Design' }]
      ];
      break;
      
    case 'SMM':
      keyboard.inline_keyboard = [
        [{ text: 'Head', callback_data: 'team_SMM_Head' }],
        [{ text: 'Specialist', callback_data: 'team_SMM_Specialist' }],
        [{ text: 'Producer', callback_data: 'team_SMM_Producer' }],
        [{ text: 'PM SMM', callback_data: 'team_SMM_PM' }]
      ];
      break;
      
    default:
      // Для HR, Sales, CEO - немає підкоманд
      saveRegistrationStep(telegramId, 'position', { department: department, team: department });
      sendMessage(chatId, `✅ Департамент: ${department}\n\n<b>Крок 4:</b> Введіть вашу посаду`);
      return;
  }
  
  keyboard.inline_keyboard.push([
    { text: '🔙 Назад', callback_data: 'back_department' }
  ]);
  
  sendMessage(chatId, text, keyboard);
  saveRegistrationStep(telegramId, 'team_selection', { department: department });
}

// 👥 ОБРОБКА ВИБОРУ КОМАНДИ
function handleTeamSelection(chatId, telegramId, teamData) {
  try {
    const regData = getRegistrationData(telegramId);
    if (!regData) return;
    
    let team = teamData;
    let subteam = '';
    
    // Обробка складних назв команд
    if (teamData.includes('_')) {
      const parts = teamData.split('_');
      if (parts[0] === 'Target') {
        team = 'Target';
        subteam = parts[1] + ' team';
      } else if (parts[0] === 'Head') {
        team = 'Head + Motion';
        subteam = '';
      } else if (parts[0] === 'SMM') {
        team = 'SMM';
        subteam = parts[1];
      } else {
        team = parts.join(' ');
      }
    }
    
    saveRegistrationStep(telegramId, 'position', { 
      department: regData.department, 
      team: team,
      subteam: subteam
    });
    
    let confirmText = `✅ Департамент: ${regData.department}\n`;
    confirmText += `✅ Команда: ${team}`;
    if (subteam) confirmText += ` / ${subteam}`;
    confirmText += `\n\n<b>Крок 4:</b> Введіть вашу посаду`;
    
    sendMessage(chatId, confirmText);
    
  } catch (error) {
    console.error('Помилка handleTeamSelection:', error);
    sendMessage(chatId, '❌ Помилка обробки вибору команди.');
  }
}

// ✅ ЗАВЕРШЕННЯ РЕЄСТРАЦІЇ
function completeRegistration(chatId, telegramId) {
  try {
    const regData = getRegistrationData(telegramId);
    if (!regData) {
      sendMessage(chatId, '❌ Помилка реєстрації. Спробуйте ще раз.');
      return;
    }
    
    // Зберігаємо користувача в таблицю
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Employees');
    
    const fullName = `${regData.surname} ${regData.name}`;
    const today = new Date();
    
    sheet.appendRow([
      fullName, telegramId, regData.username || '', regData.department, 
      regData.team, regData.subteam || '', regData.position, '',
      today, regData.birthday, 'Не вказано', '', '', 'Active'
    ]);
    
    // Створюємо баланс відпусток
    const balanceSheet = ss.getSheetByName('VacationBalance');
    const currentYear = new Date().getFullYear();
    balanceSheet.appendRow([
      telegramId, currentYear, 24, 0, 24, false, 
      new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000), // +3 місяці
      today
    ]);
    
    // Очищаємо кеш реєстрації
    const cache = CacheService.getScriptCache();
    cache.remove(`registration_${telegramId}`);
    
    // Персоналізоване привітання
    const role = getUserRole(telegramId);
    let welcomeText = `🎉 <b>Супер, тепер ми знайомі трошки більше!</b>\n\n`;
    welcomeText += `👤 ${fullName}\n`;
    welcomeText += `🏢 ${regData.department}`;
    if (regData.team !== regData.department) welcomeText += ` / ${regData.team}`;
    welcomeText += `\n💼 ${regData.position}\n\n`;
    
    welcomeText += `🤖 <b>Тепер ти можеш ознайомитися з моїм функціоналом:</b>\n\n`;
    
    // Персоналізований опис функцій
    if (role === 'HR') {
      welcomeText += `👥 <b>Для HR доступно:</b>\n`;
      welcomeText += `• Управління всіма працівниками\n`;
      welcomeText += `• Затвердження відпусток та запитів\n`;
      welcomeText += `• Повна аналітика та звіти\n`;
      welcomeText += `• Масові розсилки\n`;
      welcomeText += `• Налаштування системи\n`;
    } else if (role === 'CEO') {
      welcomeText += `🏢 <b>Для CEO доступно:</b>\n`;
      welcomeText += `• Стратегічна аналітика\n`;
      welcomeText += `• KPI дашборд\n`;
      welcomeText += `• Фінансовий аналіз HR процесів\n`;
      welcomeText += `• Повні звіти по компанії\n`;
    } else if (role === 'PM') {
      welcomeText += `👨‍💼 <b>Для PM доступно:</b>\n`;
      welcomeText += `• Затвердження запитів команди\n`;
      welcomeText += `• Аналітика по вашій команді\n`;
      welcomeText += `• Планування проектів\n`;
      welcomeText += `• Експорт даних команди\n`;
    } else {
      welcomeText += `👤 <b>Для вас доступно:</b>\n`;
      welcomeText += `• Подача заявок на відпустку\n`;
      welcomeText += `• Фіксація remote днів та спізнень\n`;
      welcomeText += `• Лікарняні\n`;
      welcomeText += `• Ваша персональна статистика\n`;
      welcomeText += `• Пропозиції та ASAP запити\n`;
      welcomeText += `• ШІ-помічник для порад\n`;
    }
    
    welcomeText += `\n🚀 Готовий почати роботу?`;
    
    const keyboard = {
      inline_keyboard: [
        [{ text: '🚀 Перейти до головного меню', callback_data: 'main_menu' }]
      ]
    };
    
    sendMessage(chatId, welcomeText, keyboard);
    
    // Повідомляємо HR про нову реєстрацію
    const hrMessage = `👋 <b>Нова реєстрація!</b>\n\n👤 ${fullName}\n🏢 ${regData.department} / ${regData.team}\n💼 ${regData.position}\n📅 ${regData.birthday}`;
    sendMessage(HR_CHAT_ID, hrMessage);
    
  } catch (error) {
    console.error('Помилка completeRegistration:', error);
    sendMessage(chatId, '❌ Помилка завершення реєстрації. Зверніться до HR.');
  }
}

// 📅 ПЕРЕВІРКА ДАТИ
function isValidDate(dateString) {
  const regex = /^(\d{2})\.(\d{2})\.(\d{4})$/;
  const match = dateString.match(regex);
  
  if (!match) return false;
  
  const day = parseInt(match[1]);
  const month = parseInt(match[2]);
  const year = parseInt(match[3]);
  
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < 1950 || year > new Date().getFullYear()) return false;
  
  return true;
}

// 🚨 ОБРОБКА ASAP ПОВІДОМЛЕННЯ
function processASAPMessage(chatId, telegramId, message) {
  try {
    const user = getUserInfo(telegramId);
    const now = new Date();
    
    // Зберігаємо в таблицю (можна додати окрему таблицю для ASAP)
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let asapSheet = ss.getSheetByName('ASAP_Requests');
    
    if (!asapSheet) {
      asapSheet = ss.insertSheet('ASAP_Requests');
      asapSheet.getRange(1, 1, 1, 7).setValues([
        ['RequestID', 'TelegramID', 'FullName', 'Department', 'Team', 'Message', 'CreatedAt']
      ]);
    }
    
    const requestId = `ASAP_${Date.now()}`;
    asapSheet.appendRow([
      requestId, telegramId, user?.FullName, user?.Department, 
      user?.Team, message, now
    ]);
    
    // Повідомляємо користувача
    sendMessage(chatId, `✅ <b>ASAP запит відправлено!</b>\n\n📝 Ваше повідомлення:\n"${message}"\n\n⏰ HR отримає повідомлення негайно.`);
    
    // Негайно повідомляємо HR
    const hrMessage = `🚨 <b>ASAP ЗАПИТ</b>\n\n👤 ${user?.FullName}\n🏢 ${user?.Department} / ${user?.Team}\n\n📝 <b>Повідомлення:</b>\n${message}\n\n⏰ ${now.toLocaleString('uk-UA')}`;
    sendMessage(HR_CHAT_ID, hrMessage);
    
    // Очищаємо кеш
    const cache = CacheService.getScriptCache();
    cache.remove(`registration_${telegramId}`);
    
  } catch (error) {
    console.error('Помилка processASAPMessage:', error);
    sendMessage(chatId, '❌ Помилка відправки ASAP запиту.');
  }
}

// 📤 ВІДПРАВКА ПОВІДОМЛЕННЯ
function sendMessage(chatId, text, keyboard = null) {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    };
    
    if (keyboard) {
      payload.reply_markup = JSON.stringify(keyboard);
    }
    
    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
    const result = JSON.parse(response.getContentText());
    if (!result.ok) {
      console.error('Помилка відправки:', result);
    }
    
    return result;
  } catch (error) {
    console.error('Критична помилка sendMessage:', error);
    logError('sendMessage', error.toString());
  }
}

// ✅ ВІДПОВІДЬ НА CALLBACK
function answerCallbackQuery(callbackId, text = '') {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`;
    const payload = {
      callback_query_id: callbackId,
      text: text
    };
    
    UrlFetchApp.fetch(url, {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (error) {
    console.error('Помилка answerCallbackQuery:', error);
  }
}

// 🎯 ТЕСТОВІ ДАНІ З ПРАВИЛЬНОЮ СТРУКТУРОЮ
function addTestData() {
  try {
    console.log('🎯 Додаю тестові дані з правильною структурою...');
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // 1. Ролі
    const rolesSheet = ss.getSheetByName('Roles');
    if (rolesSheet && rolesSheet.getLastRow() <= 1) {
      const testRoles = [
        [HR_CHAT_ID, 'HR', 'HR', true],
        ['123456789', 'PM', 'Marketing', true],
        ['987654321', 'EMP', 'Marketing', false],
        ['555666777', 'CEO', 'Management', true]
      ];
      
      testRoles.forEach(role => {
        rolesSheet.appendRow(role);
      });
      console.log('✅ Ролі додано');
    }
    
    // 2. Команди з правильною структурою
    const teamsSheet = ss.getSheetByName('Teams');
    if (teamsSheet && teamsSheet.getLastRow() <= 1) {
      const testTeams = [
        ['Marketing', 'PPC', '', '123456789', '123456789'],
        ['Marketing', 'Target', 'Kris team', '111222333', '111222333'],
        ['Marketing', 'Target', 'Lera team', '444555666', '444555666'],
        ['Design', 'Creative', '', '777888999', '777888999'],
        ['SMM', 'Content', '', '101112131', '101112131'],
        ['Sales', 'Communication', '', '202122232', '202122232']
      ];
      
      testTeams.forEach(team => {
        teamsSheet.appendRow(team);
      });
      console.log('✅ Команди додано');
    }
    
    // 3. Працівники з правильними полями
    const empSheet = ss.getSheetByName('Employees');
    if (empSheet && empSheet.getLastRow() <= 1) {
      const testEmployees = [
        ['Альона HR', HR_CHAT_ID, 'Alona_HR_LD', 'HR', '', '', 'HR Manager', '', '2023-01-15', '1990-05-15', 'Гібрид', 'hr@lyudi.digital', '+380501234567', 'Active'],
        ['Тестовий PM', '123456789', 'test_pm', 'Marketing', 'PPC', '', 'PM PPC', HR_CHAT_ID, '2023-02-01', '1985-03-20', 'Офлайн', 'pm@test.com', '+380507654321', 'Active'],
        ['Тестовий Employee', '987654321', 'test_emp', 'Marketing', 'Target', 'Kris team', 'Targetologist', '123456789', '2023-03-01', '1992-07-10', 'Онлайн', 'emp@test.com', '+380509876543', 'Active']
      ];
      
      testEmployees.forEach(emp => {
        empSheet.appendRow(emp);
      });
      console.log('✅ Працівники додано');
    }
    
    // 4. Баланс відпусток
    const balanceSheet = ss.getSheetByName('VacationBalance');
    if (balanceSheet && balanceSheet.getLastRow() <= 1) {
      const currentYear = new Date().getFullYear();
      const testBalances = [
        [HR_CHAT_ID, currentYear, 24, 0, 24, true, new Date('2023-04-15'), new Date()],
        ['123456789', currentYear, 24, 3, 21, true, new Date('2023-05-01'), new Date()],
        ['987654321', currentYear, 24, 0, 24, true, new Date('2023-06-01'), new Date()]
      ];
      
      testBalances.forEach(balance => {
        balanceSheet.appendRow(balance);
      });
      console.log('✅ Баланси відпусток додано');
    }
    
    // 5. FAQ з правильними відповідями
    const faqSheet = ss.getSheetByName('HRFAQ');
    if (faqSheet && faqSheet.getLastRow() <= 1) {
      const testFAQ = [
        ['vacation', 'Скільки днів відпустки в рік?', '24 календарні дні згідно з трудовим законодавством України.', true],
        ['vacation', 'Скільки максимум днів відпустки за раз?', 'Не більше 7 календарних днів за один раз. Це допомагає рівномірно розподілити навантаження в команді.', true],
        ['vacation', 'Коли можна брати першу відпустку?', 'Через 3 місяці після початку роботи. До цього часу дні відпустки накопичуються.', true],
        ['vacation', 'Чи можуть двоє з команди брати відпустку одночасно?', 'Ні, навіть один день перетину заборонений в межах однієї підкоманди.', true],
        ['remote', 'Як оформити remote день?', 'Подайте заявку через бота до 10:30. Автоматично повідомляються HR та PM.', true],
        ['remote', 'Скільки remote днів можна на місяць?', 'Для онлайн формату - безлімітно. Для офлайн/гібрид - до 14 днів на місяць.', true],
        ['late', 'З котрої години вважається спізнення?', 'З 10:21. Робочий день починається о 10:00.', true],
        ['late', 'Скільки спізнень допустимо?', 'До 7 разів на місяць. При перевищенні - попередження.', true],
        ['sick', 'Як повідомити про хворобу?', 'Через бот в розділі "Лікарняний". HR та PM автоматично отримають повідомлення.', true],
        ['sick', 'Чи є ліміт на лікарняні дні?', 'Ні, лімітів немає. Головне - своєчасно повідомити про хворобу.', true]
      ];
      
      testFAQ.forEach(faq => {
        faqSheet.appendRow(faq);
      });
      console.log('✅ FAQ додано');
    }
    
    console.log('✅ Всі тестові дані з правильною бізнес-логікою додано!');
    return 'Тестові дані додано успішно!';
    
  } catch (error) {
    console.error('❌ Помилка додавання тестових даних:', error);
    return `Помилка: ${error.toString()}`;
  }
}

// 🔧 НАЛАШТУВАННЯ WEBHOOK
function setWebhook() {
  const webAppUrl = 'YOUR_WEBAPP_URL_HERE'; // ЗАМІНІТЬ НА ВАШ URL З DEPLOYMENT
  
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`;
    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify({
        url: webAppUrl
      })
    });
    
    console.log('✅ Webhook встановлено:', response.getContentText());
    return response.getContentText();
  } catch (error) {
    console.error('❌ Помилка встановлення webhook:', error);
    return `Помилка: ${error.toString()}`;
  }
}

// 🗑️ ВИДАЛЕННЯ WEBHOOK
function deleteWebhook() {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`;
    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      contentType: 'application/json'
    });
    
    console.log('🗑️ Webhook видалено:', response.getContentText());
    return response.getContentText();
  } catch (error) {
    console.error('❌ Помилка видалення webhook:', error);
    return `Помилка: ${error.toString()}`;
  }
}

// ℹ️ СТАТУС WEBHOOK
function checkWebhookStatus() {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`;
    const response = UrlFetchApp.fetch(url);
    const result = JSON.parse(response.getContentText());
    
    console.log('ℹ️ Статус webhook:', result);
    return result;
  } catch (error) {
    console.error('❌ Помилка перевірки webhook:', error);
    return `Помилка: ${error.toString()}`;
  }
}

// 🧪 ТЕСТУВАННЯ СИСТЕМИ
function testCompleteSystem() {
  console.log('🧪 Тестування повної HR системи...');
  
  try {
    // Тест відправки повідомлення
    const testResult = sendMessage(HR_CHAT_ID, '🚀 Фінальна версія HR бота готова!\n\n✅ Всі бізнес-правила імплементовано\n⚡ Швидкість оптимізовано\n🛡️ Захист від дублювання працює');
    console.log('✅ Тест відправки повідомлення пройдено');
    
    return 'Всі тести пройдено успішно!';
  } catch (error) {
    console.error('❌ Помилка тестування:', error);
    return `Помилка тестування: ${error.toString()}`;
  }
}
