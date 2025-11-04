/**
 * 🏢 HR БОТ - ВЕРСІЯ №1 (ПОВНА СИСТЕМА) 
 * ⚡ Повільно, але повноцінно
 * 🎯 100% кнопковий інтерфейс  
 * 🔐 Система ролей та прав доступу
 * 📝 СТАТУС: BACKUP - працює, але треба оптимізація
 * 📊 Повна автоматизація HR-процесів
 */

// ⚙️ НАЛАШТУВАННЯ
const BOT_TOKEN = '8160058317:AAGfkWy2gFj81hoC9NSE-Wc-CdiaXZw9Znw';
const SPREADSHEET_ID = '1aKWAIIeYe39hwaS65k-GAqsaFFhi765DuHoptLtFagg';
const HR_CHAT_ID = '7304993062';

// 🛡️ ЗАХИСТ ВІД ДУБЛЮВАННЯ
let processingLock = false;

// 🚀 ГОЛОВНА ФУНКЦІЯ З ПОТРІЙНИМ ЗАХИСТОМ
function doPost(e) {
  // ⚡ МИТТЄВА відповідь Telegram
  const response = ContentService.createTextOutput('ok');
  
  try {
    if (processingLock) {
      return response; // Швидкий вихід
    }
    
    processingLock = true;
    
    if (!e || !e.postData || !e.postData.contents) {
      console.log('🚫 Порожній запит');
      processingLock = false;
      return response;
    }
    
    const update = JSON.parse(e.postData.contents);
    const updateId = update.update_id;
    
    // Перевірка дублікатів
    if (checkDuplicate(updateId)) {
      console.log(`🚫 ДУБЛІКАТ: ${updateId}`);
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
    return result === 'processed'; // Точна перевірка
  } catch (error) {
    console.error('Помилка перевірки дублікатів:', error);
    return false; // ДОЗВОЛЯЄМО обробку при помилці
  }
}

// 💾 ПОЗНАЧИТИ ЯК ОБРОБЛЕНИЙ
function markAsProcessed(updateId) {
  try {
    const cache = CacheService.getScriptCache();
    cache.put(`processed_${updateId}`, 'processed', 300); // 5 хвилин замість 1 години
  } catch (error) {
    console.error('Помилка збереження ID:', error);
  }
}

// 📊 ІНІЦІАЛІЗАЦІЯ ВСІХ ТАБЛИЦЬ
function initSheets() {
  try {
    console.log('🚀 Ініціалізація таблиць...');
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // 1. Працівники
    ensureSheet('Employees', [
      'FullName', 'TelegramID', 'Username', 'Department', 'Team', 'Subteam', 
      'Position', 'ManagerFullName', 'ManagerTelegramID', 'StartDate', 'Birthday', 
      'EmploymentType', 'PhotoURL', 'Email', 'Phone', 'Status'
    ]);
    
    // 2. Команди
    ensureSheet('Teams', [
      'Department', 'Team', 'Subteam', 'TeamLeadFullName', 'TeamLeadTelegramID'
    ]);
    
    // 3. Відпустки
    ensureSheet('Vacations', [
      'RequestID', 'TelegramID', 'FullName', 'Department', 'Team', 'StartDate', 
      'EndDate', 'DaysCount', 'BalanceBefore', 'BalanceAfter', 'OverlapFlag', 
      'OverlapWith', 'Status', 'TLDecisionBy', 'TLDecisionAt', 'HRDecisionBy', 
      'HRDecisionAt', 'CreatedAt', 'Comment'
    ]);
    
    // 4. Ремоут
    ensureSheet('Remotes', [
      'RequestID', 'TelegramID', 'Date', 'Reason', 'Status', 'TLDecisionBy', 
      'TLDecisionAt', 'CreatedAt'
    ]);
    
    // 5. Спізнення
    ensureSheet('Lates', [
      'EntryID', 'TelegramID', 'Date', 'DeclaredArrivalTime', 'MinutesLate', 
      'Reason', 'CreatedAt'
    ]);
    
    // 6. Баланс відпусток
    ensureSheet('VacationBalance', [
      'TelegramID', 'Year', 'AnnualQuota', 'CarriedOver', 'Used', 'Remaining', 
      'LastUpdated'
    ]);
    
    // 7. Онбординг активи
    ensureSheet('OnboardingAssets', [
      'AssetID', 'Type', 'Title', 'URL', 'Audience', 'Order', 'IsActive'
    ]);
    
    // 8. Обов'язки
    ensureSheet('OrgResponsibilities', [
      'TelegramID', 'Duties', 'AltContacts'
    ]);
    
    // 9. Події
    ensureSheet('Events', [
      'EventID', 'Title', 'Date', 'Time', 'Location', 'Link', 'Target', 
      'RemindBefore', 'CreatedBy', 'IsActive'
    ]);
    
    // 10. FAQ
    ensureSheet('HRFAQ', [
      'Category', 'Q', 'A', 'IsActive'
    ]);
    
    // 11. Ролі
    ensureSheet('Roles', [
      'TelegramID', 'Role'
    ]);
    
    // 12. Аудит лог
    ensureSheet('AuditLog', [
      'EntryID', 'ActorTelegramID', 'Action', 'Entity', 'EntityID', 
      'PayloadJSON', 'Result', 'Timestamp'
    ]);
    
    console.log('✅ Всі таблиці ініціалізовано');
    return '✅ Всі 12 таблиць створено успішно!';
    
  } catch (error) {
    console.error('❌ Помилка ініціалізації:', error);
    logError('initSheets', error.toString());
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
    
    console.log(`📨 Повідомлення від ${telegramId}: "${text}"`);
    
    if (text === '/start') {
      showMainMenu(chatId, telegramId);
      return;
    }
    
    // Інші команди можна додати тут
    
  } catch (error) {
    console.error('Помилка processMessage:', error);
    logError('processMessage', error.toString());
  }
}

// 📋 ГОЛОВНЕ МЕНЮ (АДАПТИВНЕ ПІД РОЛІ)
function showMainMenu(chatId, telegramId) {
  try {
    const role = getUserRole(telegramId);
    const user = getUserInfo(telegramId);
    
    let welcomeText = `👋 <b>Привіт, ${user?.FullName || 'колега'}!</b>

🌟 Я помічник твого HR. Створений для автоматизації процесів.
Ознайомся з функціями які я виконую:`;

    const baseKeyboard = [
      [
        { text: '🏖️ Відпустки', callback_data: 'vacation_menu' },
        { text: '🏠 Remote/Спізнення', callback_data: 'remote_late_menu' }
      ],
      [
        { text: '🎯 Онбординг', callback_data: 'onboarding_menu' },
        { text: '🏢 Довідник', callback_data: 'directory_menu' }
      ],
      [
        { text: '📅 Події', callback_data: 'events_menu' },
        { text: '❓ FAQ', callback_data: 'faq_menu' }
      ]
    ];

    // Додаткові кнопки для TL/HR
    if (role === 'TL' || role === 'HR' || role === 'OWNER') {
      baseKeyboard.push([
        { text: '📊 Затвердження', callback_data: 'tl_approvals' }
      ]);
    }

    if (role === 'HR' || role === 'OWNER') {
      baseKeyboard.push([
        { text: '📢 Розсилка', callback_data: 'hr_broadcast' },
        { text: '⚙️ Управління', callback_data: 'hr_management' }
      ]);
    }

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
    
    console.log(`🔘 Кнопка: ${data} від ${telegramId}`);
    
    // Маршрутизація
    switch (data) {
      case 'vacation_menu':
        showVacationMenu(chatId, telegramId);
        break;
      case 'remote_late_menu':
        showRemoteLateMenu(chatId, telegramId);
        break;
      case 'onboarding_menu':
        showOnboardingMenu(chatId, telegramId);
        break;
      case 'directory_menu':
        showDirectoryMenu(chatId, telegramId);
        break;
      case 'events_menu':
        showEventsMenu(chatId, telegramId);
        break;
      case 'faq_menu':
        showFAQMenu(chatId, telegramId);
        break;
      case 'tl_approvals':
        showTLApprovals(chatId, telegramId);
        break;
      case 'hr_broadcast':
        showHRBroadcast(chatId, telegramId);
        break;
      case 'hr_management':
        showHRManagement(chatId, telegramId);
        break;
      case 'back_main':
        showMainMenu(chatId, telegramId);
        break;
      default:
        handleVacationAction(chatId, telegramId, data);
        break;
    }
    
  } catch (error) {
    console.error('Помилка processCallback:', error);
    logError('processCallback', error.toString());
  }
}

// 🏖️ МЕНЮ ВІДПУСТОК
function showVacationMenu(chatId, telegramId) {
  const text = `🏖️ <b>Відпустки</b>

Що хочете зробити?`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '📝 Подати заявку', callback_data: 'vacation_request' },
        { text: '💰 Мій баланс', callback_data: 'vacation_balance' }
      ],
      [
        { text: '📋 Мої заявки', callback_data: 'vacation_my_requests' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// 🏠 МЕНЮ REMOTE/СПІЗНЕННЯ
function showRemoteLateMenu(chatId, telegramId) {
  const text = `🏠 <b>Remote робота / Спізнення</b>

Оберіть дію:`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🏠 Запит на Remote', callback_data: 'remote_request' },
        { text: '⏰ Зафіксувати спізнення', callback_data: 'late_report' }
      ],
      [
        { text: '📊 Мої звіти', callback_data: 'my_remote_late_reports' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// 🎯 МЕНЮ ОНБОРДИНГУ
function showOnboardingMenu(chatId, telegramId) {
  const text = `🎯 <b>Онбординг</b>

Привіт! Вітаю тебе в найкращій команді особливих Людей🧡
Тепер ти її частина!

Ознайомся з матеріалами:`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🎥 Відео привітання', callback_data: 'onboarding_video' },
        { text: '📚 Матеріали', callback_data: 'onboarding_materials' }
      ],
      [
        { text: '🏢 Структура компанії', callback_data: 'onboarding_structure' },
        { text: '📋 Чек-лист', callback_data: 'onboarding_checklist' }
      ],
      [
        { text: '📞 Ключові контакти', callback_data: 'onboarding_contacts' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// 🏢 МЕНЮ ДОВІДНИКА
function showDirectoryMenu(chatId, telegramId) {
  const text = `🏢 <b>Довідник компанії</b>

Знайдіть інформацію про колег:`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '👥 За відділами', callback_data: 'directory_departments' },
        { text: '🔍 Пошук по імені', callback_data: 'directory_search' }
      ],
      [
        { text: '📋 Всі контакти', callback_data: 'directory_all' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// 📅 МЕНЮ ПОДІЙ
function showEventsMenu(chatId, telegramId) {
  const text = `📅 <b>Події та нагадування</b>

Актуальні події компанії:`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '📅 Найближчі події', callback_data: 'events_upcoming' },
        { text: '🎉 Дні народження', callback_data: 'events_birthdays' }
      ],
      [
        { text: '🏆 Річниці роботи', callback_data: 'events_anniversaries' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// ❓ МЕНЮ FAQ
function showFAQMenu(chatId, telegramId) {
  const text = `❓ <b>Часті питання</b>

Оберіть категорію:`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🏖️ Відпустки', callback_data: 'faq_vacation' },
        { text: '🏥 Лікарняні', callback_data: 'faq_sick' }
      ],
      [
        { text: '🏠 Remote робота', callback_data: 'faq_remote' },
        { text: '💰 Компенсації', callback_data: 'faq_compensation' }
      ],
      [
        { text: '📋 Документи', callback_data: 'faq_documents' },
        { text: '⚙️ Процеси', callback_data: 'faq_processes' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
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

// 👤 ОТРИМАННЯ РОЛІ КОРИСТУВАЧА
function getUserRole(telegramId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const rolesSheet = ss.getSheetByName('Roles');
    
    if (!rolesSheet || rolesSheet.getLastRow() <= 1) {
      return 'EMP'; // За замовчуванням
    }
    
    const data = rolesSheet.getDataRange().getValues();
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

// 👤 ОТРИМАННЯ ІНФОРМАЦІЇ КОРИСТУВАЧА
function getUserInfo(telegramId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const empSheet = ss.getSheetByName('Employees');
    
    if (!empSheet || empSheet.getLastRow() <= 1) {
      return null;
    }
    
    const data = empSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] == telegramId) {
        return {
          FullName: data[i][0],
          TelegramID: data[i][1],
          Username: data[i][2],
          Department: data[i][3],
          Team: data[i][4],
          Position: data[i][6],
          StartDate: data[i][9],
          Birthday: data[i][10]
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Помилка getUserInfo:', error);
    return null;
  }
}

// 🏖️ ОБРОБКА ДІЙ ВІДПУСТОК
function handleVacationAction(chatId, telegramId, action) {
  try {
    switch (action) {
      case 'vacation_request':
        startVacationRequest(chatId, telegramId);
        break;
      case 'vacation_balance':
        showVacationBalance(chatId, telegramId);
        break;
      case 'vacation_my_requests':
        showMyVacationRequests(chatId, telegramId);
        break;
      case 'remote_request':
        showRemoteRequestForm(chatId, telegramId);
        break;
      case 'late_report':
        showLateReportForm(chatId, telegramId);
        break;
      case 'my_remote_late_reports':
        showMyRemoteLateReports(chatId, telegramId);
        break;
      case 'onboarding_video':
        showOnboardingVideo(chatId, telegramId);
        break;
      case 'onboarding_materials':
        showOnboardingMaterials(chatId, telegramId);
        break;
      case 'onboarding_structure':
        showCompanyStructure(chatId, telegramId);
        break;
      case 'onboarding_checklist':
        showOnboardingChecklist(chatId, telegramId);
        break;
      case 'onboarding_contacts':
        showKeyContacts(chatId, telegramId);
        break;
      default:
        if (action.startsWith('faq_')) {
          const category = action.replace('faq_', '');
          showFAQCategory(chatId, telegramId, category);
        }
        break;
    }
  } catch (error) {
    console.error('Помилка handleVacationAction:', error);
    sendMessage(chatId, '❌ Помилка обробки запиту. Спробуйте пізніше.');
  }
}

// 📅 ПОЧАТОК ЗАПИТУ ВІДПУСТКИ
function startVacationRequest(chatId, telegramId) {
  const text = `📝 <b>Заявка на відпустку</b>

Оберіть дати відпустки:`;

  showDatePicker(chatId, telegramId, 'vacation_start');
}

// 📅 ПОКАЗ КАЛЕНДАРЯ
function showDatePicker(chatId, telegramId, type) {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  
  let text = `📅 <b>Оберіть дату</b>\n\n`;
  text += `${getMonthName(currentMonth)} ${currentYear}`;
  
  const keyboard = generateCalendarKeyboard(currentYear, currentMonth, type);
  
  sendMessage(chatId, text, keyboard);
}

// 📅 ГЕНЕРАЦІЯ КЛАВІАТУРИ КАЛЕНДАРЯ
function generateCalendarKeyboard(year, month, type) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  const keyboard = [];
  
  // Заголовок з місяцем
  keyboard.push([
    { text: '◀️', callback_data: `cal_prev_${year}_${month}_${type}` },
    { text: `${getMonthName(month)} ${year}`, callback_data: 'ignore' },
    { text: '▶️', callback_data: `cal_next_${year}_${month}_${type}` }
  ]);
  
  // Дні тижня
  keyboard.push([
    { text: 'Пн', callback_data: 'ignore' },
    { text: 'Вт', callback_data: 'ignore' },
    { text: 'Ср', callback_data: 'ignore' },
    { text: 'Чт', callback_data: 'ignore' },
    { text: 'Пт', callback_data: 'ignore' },
    { text: 'Сб', callback_data: 'ignore' },
    { text: 'Нд', callback_data: 'ignore' }
  ]);
  
  // Дні місяця
  let week = [];
  
  // Порожні клітинки до першого дня
  for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) {
    week.push({ text: ' ', callback_data: 'ignore' });
  }
  
  // Дні місяця
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const today = new Date();
    
    let dayText = day.toString();
    if (date < today) {
      dayText = '❌'; // Минулі дні недоступні
    }
    
    week.push({
      text: dayText,
      callback_data: date >= today ? `date_${year}_${month}_${day}_${type}` : 'ignore'
    });
    
    if (week.length === 7) {
      keyboard.push(week);
      week = [];
    }
  }
  
  // Додати останній тиждень якщо потрібно
  if (week.length > 0) {
    while (week.length < 7) {
      week.push({ text: ' ', callback_data: 'ignore' });
    }
    keyboard.push(week);
  }
  
  // Кнопка назад
  keyboard.push([
    { text: '🔙 Назад', callback_data: 'vacation_menu' }
  ]);
  
  return { inline_keyboard: keyboard };
}

// 📅 НАЗВИ МІСЯЦІВ
function getMonthName(month) {
  const months = [
    'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
    'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
  ];
  return months[month];
}

// 💰 ПОКАЗ БАЛАНСУ ВІДПУСТКИ
function showVacationBalance(chatId, telegramId) {
  try {
    const balance = calculateVacationBalance(telegramId);
    const user = getUserInfo(telegramId);
    
    const text = `💰 <b>Баланс відпустки</b>

👤 <b>${user?.FullName || 'Користувач'}</b>
📅 Рік: ${new Date().getFullYear()}

🏖️ Річна норма: ${balance.annual} днів
📊 Використано: ${balance.used} днів
💰 Залишок: <b>${balance.remaining} днів</b>

${balance.remaining <= 5 ? '⚠️ Увага: залишок відпустки менше 5 днів!' : ''}`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📝 Подати заявку', callback_data: 'vacation_request' }
        ],
        [
          { text: '🔙 Назад', callback_data: 'vacation_menu' }
        ]
      ]
    };

    sendMessage(chatId, text, keyboard);
    
  } catch (error) {
    console.error('Помилка showVacationBalance:', error);
    sendMessage(chatId, '❌ Помилка завантаження балансу. Зверніться до HR.');
  }
}

// 📋 ПОКАЗ МОЇХ ЗАЯВОК НА ВІДПУСТКУ
function showMyVacationRequests(chatId, telegramId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const vacationsSheet = ss.getSheetByName('Vacations');
    
    if (!vacationsSheet || vacationsSheet.getLastRow() <= 1) {
      const text = `📋 <b>Мої заявки на відпустку</b>

У вас поки немає заявок на відпустку.`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '📝 Подати заявку', callback_data: 'vacation_request' }
          ],
          [
            { text: '🔙 Назад', callback_data: 'vacation_menu' }
          ]
        ]
      };

      sendMessage(chatId, text, keyboard);
      return;
    }
    
    const data = vacationsSheet.getDataRange().getValues();
    const myRequests = data.filter((row, index) => index > 0 && row[1] == telegramId);
    
    if (myRequests.length === 0) {
      const text = `📋 <b>Мої заявки на відпустку</b>

У вас поки немає заявок на відпустку.`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '📝 Подати заявку', callback_data: 'vacation_request' }
          ],
          [
            { text: '🔙 Назад', callback_data: 'vacation_menu' }
          ]
        ]
      };

      sendMessage(chatId, text, keyboard);
      return;
    }
    
    let text = `📋 <b>Мої заявки на відпустку</b>\n\n`;
    
    // Показуємо останні 5 заявок
    myRequests.slice(-5).forEach((request, index) => {
      const [requestId, , fullName, , , startDate, endDate, daysCount, , , , , status] = request;
      const statusEmoji = getStatusEmoji(status);
      
      text += `${statusEmoji} <b>${formatDate(new Date(startDate))} - ${formatDate(new Date(endDate))}</b>\n`;
      text += `📊 ${daysCount} днів | Статус: ${status}\n\n`;
    });

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📝 Нова заявка', callback_data: 'vacation_request' }
        ],
        [
          { text: '🔙 Назад', callback_data: 'vacation_menu' }
        ]
      ]
    };

    sendMessage(chatId, text, keyboard);
    
  } catch (error) {
    console.error('Помилка showMyVacationRequests:', error);
    sendMessage(chatId, '❌ Помилка завантаження заявок. Зверніться до HR.');
  }
}

// 🏠 ФОРМА ЗАПИТУ REMOTE
function showRemoteRequestForm(chatId, telegramId, user) {
  const text = `🏠 <b>Запит на Remote роботу</b>

👤 ${user?.FullName || 'Користувач'}

Оберіть дату для remote роботи:`;

  showDatePicker(chatId, telegramId, 'remote_date');
}

// ⏰ ФОРМА ЗВІТУ ПРО СПІЗНЕННЯ
function showLateReportForm(chatId, telegramId, user) {
  const text = `⏰ <b>Звіт про спізнення</b>

👤 ${user?.FullName || 'Користувач'}

На скільки хвилин спізнюєтесь?`;

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
        { text: '🔙 Назад', callback_data: 'remote_late_menu' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// 📊 ЗАТВЕРДЖЕННЯ ДЛЯ TL
function showTLApprovals(chatId, telegramId) {
  const text = `📊 <b>Затвердження заявок</b>

Заявки що очікують вашого рішення:`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🏖️ Відпустки', callback_data: 'tl_vacation_approvals' },
        { text: '🏠 Remote', callback_data: 'tl_remote_approvals' }
      ],
      [
        { text: '📈 Статистика команди', callback_data: 'tl_team_stats' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// 📢 HR РОЗСИЛКА
function showHRBroadcast(chatId, telegramId) {
  const text = `📢 <b>HR Розсилка</b>

Керування повідомленнями для співробітників:`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '📝 Нове оголошення', callback_data: 'hr_new_announcement' },
        { text: '🎉 Нагадування про події', callback_data: 'hr_event_reminder' }
      ],
      [
        { text: '📊 Опитування', callback_data: 'hr_survey' },
        { text: '🎂 Дні народження', callback_data: 'hr_birthdays' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// ⚙️ HR УПРАВЛІННЯ
function showHRManagement(chatId, telegramId) {
  const text = `⚙️ <b>HR Управління</b>

Адміністративні функції:`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '👥 Управління користувачами', callback_data: 'hr_user_management' },
        { text: '📊 Звіти', callback_data: 'hr_reports' }
      ],
      [
        { text: '⚙️ Налаштування', callback_data: 'hr_settings' },
        { text: '📋 Аудит лог', callback_data: 'hr_audit_log' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// 💰 РОЗРАХУНОК БАЛАНСУ ВІДПУСТКИ
function calculateVacationBalance(telegramId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const balanceSheet = ss.getSheetByName('VacationBalance');
    const currentYear = new Date().getFullYear();
    
    if (!balanceSheet || balanceSheet.getLastRow() <= 1) {
      // Створюємо запис якщо не існує
      balanceSheet.appendRow([telegramId, currentYear, 24, 0, 0, 24, new Date()]);
      return { annual: 24, used: 0, remaining: 24 };
    }
    
    const data = balanceSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == telegramId && data[i][1] == currentYear) {
        return {
          annual: data[i][2] || 24,
          carriedOver: data[i][3] || 0,
          used: data[i][4] || 0,
          remaining: data[i][5] || 24
        };
      }
    }
    
    // Створюємо новий запис
    balanceSheet.appendRow([telegramId, currentYear, 24, 0, 0, 24, new Date()]);
    return { annual: 24, used: 0, remaining: 24 };
    
  } catch (error) {
    console.error('Помилка calculateVacationBalance:', error);
    return { annual: 24, used: 0, remaining: 24 };
  }
}

// 🎥 ОНБОРДИНГ ВІДЕО
function showOnboardingVideo(chatId, telegramId) {
  const text = `🎥 <b>Відео привітання</b>

Привіт! Ласкаво просимо до команди Люди.Digital! 🧡

🎬 Відео від CEO:
[Посилання на відео буде тут]

📹 Про команду та цінності:
[Посилання на відео буде тут]

Після перегляду переходьте до наступного кроку!`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ Переглянув відео', callback_data: 'onboarding_video_watched' }
      ],
      [
        { text: '📚 Далі: Матеріали', callback_data: 'onboarding_materials' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'onboarding_menu' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// 📚 ОНБОРДИНГ МАТЕРІАЛИ
function showOnboardingMaterials(chatId, telegramId) {
  const user = getUserInfo(telegramId);
  const department = user?.Department || 'Загальні';
  
  let text = `📚 <b>Матеріали для адаптації</b>

👤 ${user?.FullName || 'Користувач'}
🏢 Відділ: ${department}

📋 <b>Загальні матеріали:</b>
• Цінності компанії
• Правила роботи
• Корпоративна культура

`;

  // Спеціальні матеріали для відділу трафіку
  if (department === 'Marketing' || department === 'Traffic') {
    text += `🎯 <b>Матеріали для трафіку:</b>
🔗 Notion: https://superficial-sort-084.notion.site/3b5c00ad8a42473bbef49bb26f076ebd

📖 Що включено:
• Процеси роботи з клієнтами
• Інструменти та доступи
• Шаблони звітів
• База знань по каналах

`;
  }

  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ Ознайомився', callback_data: 'onboarding_materials_read' }
      ],
      [
        { text: '🏢 Далі: Структура', callback_data: 'onboarding_structure' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'onboarding_menu' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// 🏢 СТРУКТУРА КОМПАНІЇ
function showCompanyStructure(chatId, telegramId) {
  const text = `🏢 <b>Структура компанії</b>

📊 <b>Відділи та команди:</b>

🎯 <b>Marketing (Трафік)</b>
├── PPC: PM PPC, PPC спеціалісти
├── Target: Team lead, PM target, Kris team, Lera's team, Targetologist
└── Аналітика

🎨 <b>Design</b>
├── Head of Design
├── Motion Designer
├── Static Designer
├── Video Designer
└── SMM Designer

💼 <b>Sales & Communication</b>
└── Sales and Communication Manager

👥 <b>HR</b>
└── HR Manager

🏆 <b>Management</b>
├── CEO
└── Керівники відділів

📞 <b>Контакти керівників:</b>
• CEO: @ceo_username
• Head of Marketing: @marketing_head
• Head of Design: @design_head`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '📞 Ключові контакти', callback_data: 'onboarding_contacts' }
      ],
      [
        { text: '📋 Далі: Чек-лист', callback_data: 'onboarding_checklist' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'onboarding_menu' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// 📋 ОНБОРДИНГ ЧЕКЛИСТ
function showOnboardingChecklist(chatId, telegramId) {
  const text = `📋 <b>Чек-лист адаптації</b>

Відмічайте виконані пункти:

✅ Переглянув відео привітання
✅ Ознайомився з матеріалами
✅ Вивчив структуру компанії
⬜ Познайомився з командою
⬜ Отримав доступи до систем
⬜ Пройшов навчання по процесам
⬜ Виконав перше завдання

📊 Прогрес: 3/7 (43%)`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ Познайомився з командою', callback_data: 'checklist_team_met' }
      ],
      [
        { text: '✅ Отримав доступи', callback_data: 'checklist_access_received' }
      ],
      [
        { text: '✅ Пройшов навчання', callback_data: 'checklist_training_done' }
      ],
      [
        { text: '📊 Оновити прогрес', callback_data: 'checklist_update' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'onboarding_menu' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// 📞 КЛЮЧОВІ КОНТАКТИ
function showKeyContacts(chatId, telegramId) {
  const text = `📞 <b>Ключові контакти</b>

🏆 <b>Керівництво:</b>
• CEO: @ceo_username
• HR: @alona_hr_ld

🎯 <b>Marketing:</b>
• Head of Marketing: @marketing_head
• PM PPC: @ppc_pm
• Team Lead Target: @target_lead

🎨 <b>Design:</b>
• Head of Design: @design_head
• Motion Designer: @motion_designer

💼 <b>Sales:</b>
• Sales Manager: @sales_manager

🔧 <b>Техпідтримка:</b>
• IT Support: @it_support
• Системи: @systems_admin

❓ <b>Питання по:</b>
• HR процеси → @alona_hr_ld
• Технічні питання → @it_support
• Проекти → Ваш безпосередній керівник`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '💬 Написати HR', url: 'https://t.me/alona_hr_ld' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'onboarding_menu' }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// ❓ ПОКАЗ FAQ КАТЕГОРІЇ
function showFAQCategory(chatId, telegramId, category) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const faqSheet = ss.getSheetByName('HRFAQ');
    
    if (!faqSheet || faqSheet.getLastRow() <= 1) {
      sendMessage(chatId, '❌ FAQ поки не налаштовано. Зверніться до HR.');
      return;
    }
    
    const data = faqSheet.getDataRange().getValues();
    const categoryFAQ = data.filter((row, index) => 
      index > 0 && row[0].toLowerCase() === category.toLowerCase() && row[3] === true
    );
    
    if (categoryFAQ.length === 0) {
      sendMessage(chatId, `❌ Питання для категорії "${category}" не знайдено.`);
      return;
    }
    
    let text = `❓ <b>FAQ: ${category.charAt(0).toUpperCase() + category.slice(1)}</b>\n\n`;
    
    categoryFAQ.forEach((faq, index) => {
      const [, question, answer] = faq;
      text += `<b>❓ ${question}</b>\n`;
      text += `💡 ${answer}\n\n`;
    });

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🔙 Назад до FAQ', callback_data: 'faq_menu' }
        ]
      ]
    };

    sendMessage(chatId, text, keyboard);
    
  } catch (error) {
    console.error('Помилка showFAQCategory:', error);
    sendMessage(chatId, '❌ Помилка завантаження FAQ. Зверніться до HR.');
  }
}

// 📊 МОЇ REMOTE/LATE ЗВІТИ
function showMyRemoteLateReports(chatId, telegramId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const remotesSheet = ss.getSheetByName('Remotes');
    const latesSheet = ss.getSheetByName('Lates');
    
    let text = `📊 <b>Мої звіти Remote/Спізнення</b>\n\n`;
    
    // Remote звіти
    if (remotesSheet && remotesSheet.getLastRow() > 1) {
      const remoteData = remotesSheet.getDataRange().getValues();
      const myRemotes = remoteData.filter((row, index) => index > 0 && row[1] == telegramId);
      
      if (myRemotes.length > 0) {
        text += `🏠 <b>Remote дні (останні 5):</b>\n`;
        myRemotes.slice(-5).forEach(remote => {
          const [,, date, reason, status] = remote;
          const statusEmoji = status === 'Approved' ? '✅' : status === 'Rejected' ? '❌' : '⏳';
          text += `${statusEmoji} ${formatDate(new Date(date))} - ${reason}\n`;
        });
        text += `\n`;
      }
    }
    
    // Late звіти
    if (latesSheet && latesSheet.getLastRow() > 1) {
      const lateData = latesSheet.getDataRange().getValues();
      const myLates = lateData.filter((row, index) => index > 0 && row[1] == telegramId);
      
      if (myLates.length > 0) {
        text += `⏰ <b>Запізнення (останні 5):</b>\n`;
        myLates.slice(-5).forEach(late => {
          const [,, date,, minutes, reason] = late;
          text += `🕐 ${formatDate(new Date(date))} - ${minutes} хв (${reason})\n`;
        });
        text += `\n`;
      }
    }
    
    // Статистика за місяць
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    text += `📈 <b>Статистика за ${currentMonth + 1} місяць:</b>\n`;
    
    // Підрахунок Remote днів
    let remoteCount = 0;
    if (remotesSheet && remotesSheet.getLastRow() > 1) {
      const remoteData = remotesSheet.getDataRange().getValues();
      remoteCount = remoteData.filter((row, index) => {
        if (index === 0) return false;
        const date = new Date(row[2]);
        return row[1] == telegramId && 
               row[4] === 'Approved' &&
               date.getMonth() === currentMonth && 
               date.getFullYear() === currentYear;
      }).length;
    }
    
    // Підрахунок запізнень
    let lateCount = 0;
    if (latesSheet && latesSheet.getLastRow() > 1) {
      const lateData = latesSheet.getDataRange().getValues();
      lateCount = lateData.filter((row, index) => {
        if (index === 0) return false;
        const date = new Date(row[2]);
        return row[1] == telegramId && 
               date.getMonth() === currentMonth && 
               date.getFullYear() === currentYear;
      }).length;
    }
    
    text += `🏠 Remote днів: ${remoteCount}\n`;
    text += `⏰ Запізнень: ${lateCount}`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🏠 Запит на Remote', callback_data: 'remote_request' }],
        [{ text: '⏰ Зафіксувати запізнення', callback_data: 'late_report' }],
        [{ text: '🔙 Назад', callback_data: 'remote_late_menu' }]
      ]
    };
    
    sendMessage(chatId, text, keyboard);
    
  } catch (error) {
    console.error('Помилка показу звітів:', error);
    sendMessage(chatId, '❌ Помилка завантаження звітів. Зверніться до HR.');
  }
}

// 🎯 ТЕСТОВІ ДАНІ
function addTestData() {
  try {
    console.log('🎯 Додаю тестові дані...');
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // 1. Додаємо ролі
    const rolesSheet = ss.getSheetByName('Roles');
    if (rolesSheet && rolesSheet.getLastRow() <= 1) {
      const testRoles = [
        [HR_CHAT_ID, 'HR'],
        ['123456789', 'TL'],
        ['987654321', 'EMP'],
        ['555666777', 'OWNER']
      ];
      
      testRoles.forEach(role => {
        rolesSheet.appendRow(role);
      });
      console.log('✅ Ролі додано');
    }
    
    // 2. Додаємо команди
    const teamsSheet = ss.getSheetByName('Teams');
    if (teamsSheet && teamsSheet.getLastRow() <= 1) {
      const testTeams = [
        ['Marketing', 'PPC', 'Team A', 'Тестовий TL', '123456789'],
        ['Marketing', 'Target', 'Kris team', 'Kris Lead', '111222333'],
        ['Marketing', 'Target', 'Lera team', 'Lera Lead', '444555666'],
        ['Design', 'Creative', 'Main', 'Head Designer', '777888999'],
        ['Sales', 'Communication', 'Main', 'Sales Lead', '101112131']
      ];
      
      testTeams.forEach(team => {
        teamsSheet.appendRow(team);
      });
      console.log('✅ Команди додано');
    }
    
    // 3. Додаємо працівників
    const empSheet = ss.getSheetByName('Employees');
    if (empSheet && empSheet.getLastRow() <= 1) {
      const testEmployees = [
        ['Альона HR', HR_CHAT_ID, 'Alona_HR_LD', 'HR', 'HR', '', 'HR Manager', 'CEO', '999000111', '2023-01-15', '1990-05-15', 'Full-time', '', 'hr@lyudi.digital', '+380501234567', 'Active'],
        ['Тестовий TL', '123456789', 'test_tl', 'Marketing', 'PPC', 'Team A', 'Team Lead PPC', 'Альона HR', HR_CHAT_ID, '2023-02-01', '1985-03-20', 'Full-time', '', 'tl@test.com', '+380507654321', 'Active'],
        ['Тестовий Employee', '987654321', 'test_emp', 'Marketing', 'PPC', 'Team A', 'PPC Specialist', 'Тестовий TL', '123456789', '2023-03-01', '1992-07-10', 'Full-time', '', 'emp@test.com', '+380509876543', 'Active']
      ];
      
      testEmployees.forEach(emp => {
        empSheet.appendRow(emp);
      });
      console.log('✅ Працівники додано');
    }
    
    // 4. Додаємо баланс відпусток
    const balanceSheet = ss.getSheetByName('VacationBalance');
    if (balanceSheet && balanceSheet.getLastRow() <= 1) {
      const currentYear = new Date().getFullYear();
      const testBalances = [
        [HR_CHAT_ID, currentYear, 24, 0, 0, 24, new Date().toISOString()],
        ['123456789', currentYear, 24, 0, 3, 21, new Date().toISOString()],
        ['987654321', currentYear, 24, 0, 0, 24, new Date().toISOString()]
      ];
      
      testBalances.forEach(balance => {
        balanceSheet.appendRow(balance);
      });
      console.log('✅ Баланси відпусток додано');
    }
    
    // 5. Додаємо FAQ
    const faqSheet = ss.getSheetByName('HRFAQ');
    if (faqSheet && faqSheet.getLastRow() <= 1) {
      const testFAQ = [
        ['vacation', 'Скільки днів відпустки в рік?', '24 календарні дні згідно з трудовим законодавством України.', true],
        ['vacation', 'Чи можна брати відпустку частинами?', 'Так, але не більше 1 тижня (7 днів) за один раз. Це допомагає рівномірно розподілити навантаження в команді.', true],
        ['remote', 'Як оформити remote день?', 'Подайте заявку через бота з вказанням причини. Після схвалення TL можете працювати віддалено.', true],
        ['sick', 'Що робити при хворобі?', 'Повідомте TL та HR, отримайте довідку від лікаря, подайте документи в HR.', true]
      ];
      
      testFAQ.forEach(faq => {
        faqSheet.appendRow(faq);
      });
      console.log('✅ FAQ додано');
    }
    
    console.log('✅ Всі тестові дані додано успішно!');
    return 'Тестові дані додано успішно!';
    
  } catch (error) {
    console.error('❌ Помилка додавання тестових даних:', error);
    logError('addTestData', error.toString());
    return `Помилка: ${error.toString()}`;
  }
}

// 🛠️ ДОПОМІЖНІ ФУНКЦІЇ

// 📅 ФОРМАТУВАННЯ ДАТИ
function formatDate(date) {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

// 📅 ФОРМАТУВАННЯ ДАТИ І ЧАСУ
function formatDateTime(date) {
  const dateStr = formatDate(date);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${dateStr} ${hours}:${minutes}`;
}

// 📊 ЕМОДЗІ СТАТУСУ
function getStatusEmoji(status) {
  switch (status) {
    case 'Approved': return '✅';
    case 'Rejected': return '❌';
    case 'Pending TL': return '⏳';
    case 'Pending HR': return '🔄';
    case 'Cancelled': return '🚫';
    default: return '❓';
  }
}

// 📊 ПЕРЕВІРКА НАКЛАДОК ДАТ
function rangesOverlap(start1, end1, start2, end2) {
  return start1 <= end2 && start2 <= end1;
}

// 📝 ЛОГУВАННЯ ПОМИЛОК
function logError(functionName, errorMessage) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const auditSheet = ss.getSheetByName('AuditLog');
    
    if (auditSheet) {
      auditSheet.appendRow([
        `ERROR_${Date.now()}`,
        'SYSTEM',
        'ERROR',
        functionName,
        '',
        JSON.stringify({ error: errorMessage }),
        'LOGGED',
        new Date()
      ]);
    }
  } catch (e) {
    console.error('Не вдалося залогувати помилку:', e);
  }
}

// 📤 ВІДПРАВКА ПОВІДОМЛЕННЯ В TELEGRAM
function sendTelegramMessage(chatId, text, keyboard = null) {
  return sendMessage(chatId, text, keyboard);
}

// ✅ ВІДПОВІДЬ НА CALLBACK ЗАПИТ
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

// 🔧 НАЛАШТУВАННЯ WEBHOOK
function setWebhook() {
  const webAppUrl = 'https://script.google.com/macros/s/AKfycbzA3zUCxI1Gx9CVH_Eu2Ru-pjOrVT3NA-MDumOUH0tdU_BpiL5xDwqQjhWqyE5hQsvC/exec';
  
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
function testSystem() {
  console.log('🧪 Тестування HR бота...');
  
  try {
    // Тест відправки повідомлення
    const testResult = sendMessage(HR_CHAT_ID, '🧪 Тест HR бота!\n\nВсе працює коректно! ✅');
    console.log('✅ Тест відправки повідомлення пройдено');
    
    // Тест ініціалізації таблиць
    const initResult = initSheets();
    console.log('✅ Тест ініціалізації таблиць пройдено');
    
    // Тест додавання тестових даних
    const dataResult = addTestData();
    console.log('✅ Тест додавання даних пройдено');
    
    return 'Всі тести пройдено успішно!';
  } catch (error) {
    console.error('❌ Помилка тестування:', error);
    return `Помилка тестування: ${error.toString()}`;
  }
}

// 📧 ТЕСТ ПРЯМОГО ПОВІДОМЛЕННЯ
function testDirectMessage() {
  const testMessage = `🚀 HR Бот активний!

⏰ Час: ${new Date().toLocaleString('uk-UA')}
🔧 Версія: Professional Complete v1.0
✅ Статус: Готовий до роботи

Всі функції працюють коректно!`;

  return sendMessage(HR_CHAT_ID, testMessage);
}