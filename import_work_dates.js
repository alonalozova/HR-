/**
 * Скрипт для імпорту дат початку роботи в Google Sheets
 * Використовується для попереднього заповнення даних без TelegramID
 */

require('dotenv').config();
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// Дані про дати початку роботи
const workStartData = [
  { month: 3, day: 5, year: 2024, name: 'Вадім Охріменко' },
  { month: 3, day: 24, year: 2025, name: 'Софія Ковбасюк' },
  { month: 4, day: 1, year: 2025, name: 'Олена Волошина' },
  { month: 5, day: 1, year: 2025, name: 'Артем тімлід' },
  { month: 5, day: 5, year: 2025, name: 'Щербина Павло' },
  { month: 5, day: 12, year: 2021, name: 'Адский Владислав Куртеков' },
  { month: 5, day: 20, year: 2021, name: 'Сергій Слон' },
  { month: 6, day: 3, year: 2025, name: 'Віталій Біленький' },
  { month: 6, day: 3, year: 2024, name: 'Карась Володимир' },
  { month: 6, day: 6, year: 2023, name: 'Алена Лозова' },
  { month: 6, day: 9, year: 2025, name: 'Каріна Кім' },
  { month: 7, day: 7, year: 2025, name: 'Ліза Татуєва' },
  { month: 7, day: 14, year: 2023, name: 'Віталій Степанюк' },
  { month: 8, day: 6, year: 2025, name: 'Дарія Ніколенко' },
  { month: 8, day: 18, year: 2025, name: 'Кирило' },
  { month: 8, day: 22, year: 2022, name: 'Кристина Калита' },
  { month: 8, day: 25, year: 2025, name: 'Ростік СММ' },
  { month: 8, day: 28, year: 2023, name: 'Андрій Решетняк' },
  { month: 9, day: 2, year: 2024, name: 'Коля Шрамко' },
  { month: 9, day: 8, year: 2025, name: 'Данило Міщенко' },
  { month: 9, day: 27, year: 2021, name: 'Коля Шипілов' },
  { month: 10, day: 2, year: 2023, name: 'Діана Кравченко' },
  { month: 10, day: 2, year: 2023, name: 'Лера Наумова' },
  { month: 10, day: 10, year: 2023, name: 'Анна Гаркава' },
  { month: 10, day: 18, year: 2023, name: 'Антоніна Канаєва' },
  { month: 10, day: 25, year: 2024, name: 'Топал Ірина' },
  { month: 11, day: 4, year: 2024, name: 'Очкур Анатасія' },
  { month: 11, day: 5, year: 2024, name: 'Юля Лоза (Діз СММ)' },
  { month: 11, day: 18, year: 2024, name: 'Валерія Турченко' }
];

async function initGoogleSheets() {
  try {
    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const spreadsheetId = process.env.SPREADSHEET_ID;

    if (!serviceAccountEmail || !privateKey || !spreadsheetId) {
      throw new Error('Відсутні необхідні змінні оточення для Google Sheets');
    }

    const doc = new GoogleSpreadsheet(spreadsheetId);
    const auth = new JWT({
      email: serviceAccountEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    doc.useJwtAuth(auth);
    await doc.loadInfo();
    
    return doc;
  } catch (error) {
    console.error('❌ Помилка ініціалізації Google Sheets:', error);
    throw error;
  }
}

async function importWorkStartDates(doc, workStartData) {
  try {
    await doc.loadInfo();
    
    let workStartSheet = doc.sheetsByTitle['Дати початку роботи'];
    if (!workStartSheet) {
      workStartSheet = await doc.addSheet({
        title: 'Дати початку роботи',
        headerValues: [
          'TelegramID', 'Ім\'я та прізвище', 'Відділ', 'Команда', 'Посада', 
          'Перший робочий день', 'Дата додавання'
        ]
      });
    }
    
    const existingRows = await workStartSheet.getRows();
    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const record of workStartData) {
      const { month, day, year, name } = record;
      
      // Форматуємо дату як DD.MM.YYYY
      const firstWorkDay = `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
      
      // Нормалізуємо ім'я (прибираємо зайві пробіли)
      const normalizedName = name.trim();
      
      // Перевіряємо, чи запис вже існує (за ім'ям та датою)
      const existingRecord = existingRows.find(row => {
        const rowName = (row.get('Ім\'я та прізвище') || row.get('FullName') || '').trim();
        const rowDate = row.get('Перший робочий день') || row.get('FirstWorkDay') || '';
        return rowName === normalizedName && rowDate === firstWorkDay;
      });
      
      if (existingRecord) {
        // Якщо запис існує, але не має TelegramID, оновлюємо інші поля
        const currentTelegramID = existingRecord.get('TelegramID');
        if (!currentTelegramID || currentTelegramID === '' || currentTelegramID === 'TEMP') {
          // Оновлюємо тільки якщо TelegramID відсутній
          existingRecord.set('Ім\'я та прізвище', normalizedName);
          await existingRecord.save();
          updatedCount++;
          console.log(`🔄 Оновлено запис для ${normalizedName} (${firstWorkDay})`);
        } else {
          skippedCount++;
          console.log(`⏭️ Запис для ${normalizedName} (${firstWorkDay}) вже має TelegramID: ${currentTelegramID}`);
        }
      } else {
        // Додаємо новий запис без TelegramID
        await workStartSheet.addRow({
          'TelegramID': '', // Залишаємо пустим, буде заповнено при реєстрації
          'Ім\'я та прізвище': normalizedName,
          'Відділ': '', // Буде заповнено при реєстрації
          'Команда': '', // Буде заповнено при реєстрації
          'Посада': '', // Буде заповнено при реєстрації
          'Перший робочий день': firstWorkDay,
          'Дата додавання': new Date().toISOString()
        });
        addedCount++;
        console.log(`✅ Додано запис для ${normalizedName} (${firstWorkDay})`);
      }
    }
    
    console.log(`\n✅ Імпорт завершено:`);
    console.log(`   - Додано: ${addedCount} записів`);
    console.log(`   - Оновлено: ${updatedCount} записів`);
    console.log(`   - Пропущено: ${skippedCount} записів`);
    return { added: addedCount, updated: updatedCount, skipped: skippedCount };
  } catch (error) {
    console.error('❌ Помилка імпорту дат початку роботи:', error);
    throw error;
  }
}

// Запуск імпорту
(async () => {
  try {
    console.log('🚀 Початок імпорту дат початку роботи...\n');
    const doc = await initGoogleSheets();
    console.log(`✅ Підключено до таблиці: ${doc.title}\n`);
    
    const result = await importWorkStartDates(doc, workStartData);
    
    console.log(`\n🎉 Імпорт успішно завершено!`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Критична помилка:', error);
    process.exit(1);
  }
})();

