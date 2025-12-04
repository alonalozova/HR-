# 🔧 Інтеграція модулів в основний файл

## ✅ Виконано

1. ✅ Додано імпорти всіх services та handlers
2. ✅ Створено функцію `initializeModules()` для ініціалізації всіх модулів
3. ✅ Додано виклик `initializeModules()` після `initGoogleSheets()`

## ⏳ Залишилось зробити

### 1. Замінити виклики функцій на виклики методів класів

#### В `processMessage` (рядок ~759):
- `showVacationForm` → `vacationHandler.showVacationForm`
- `showVacationBalance` → `vacationHandler.showVacationBalance`
- `showMyVacationRequests` → `vacationHandler.showMyVacationRequests`
- `showEmergencyVacationForm` → `vacationHandler.showEmergencyVacationForm`
- `handleVacationProcess` → `vacationHandler.handleVacationProcess`
- `setRemoteToday` → `remoteHandler.setRemoteToday`
- `showRemoteCalendar` → `remoteHandler.showRemoteCalendar`
- `showRemoteStats` → `remoteHandler.showRemoteStats`
- `handleRemoteProcess` → `remoteHandler.handleRemoteProcess`
- `reportLate` → `lateHandler.reportLate`
- `handleLateToday` → `lateHandler.handleLateToday`
- `handleLateOtherDate` → `lateHandler.handleLateOtherDate`
- `handleLateAddReason` → `lateHandler.handleLateAddReason`
- `handleLateSkipReason` → `lateHandler.handleLateSkipReason`
- `showLateStats` → `lateHandler.showLateStats`
- `handleLateProcess` → `lateHandler.handleLateProcess`
- `reportSick` → `sickHandler.reportSick`
- `showSickStats` → `sickHandler.showSickStats`
- `handleSickProcess` → `sickHandler.handleSickProcess`
- `showWelcomeMessage` → `registrationHandler.showWelcomeMessage`
- `startRegistration` → `registrationHandler.startRegistration`
- `handleRegistrationStep` → `registrationHandler.handleRegistrationStep` (або окремі методи)
- `completeRegistration` → `registrationHandler.completeRegistration`
- `showApprovalsMenu` → `approvalHandler.showApprovalsMenu`
- `showApprovalVacations` → `approvalHandler.showApprovalVacations`

#### В `processCallback` (рядок ~936):
- Всі ті ж заміни, що й в `processMessage`
- Додатково:
  - `handleHRVacationApproval` → `approvalHandler.handleHRVacationApproval`
  - `showVacationRequestDetails` → `approvalHandler.showVacationRequestDetails`
  - `showApprovalRemote` → `approvalHandler.showApprovalRemote`

### 2. Перевірити, що всі функції передані в dependencies

Переконатися, що всі функції, які використовуються в handlers, передані в `dependencies`:
- `sendMessage` ✅
- `getUserInfo` ✅
- `getUserRole` ✅
- `getPMForUser` ✅
- `formatDate` ✅
- `logUserData` ✅
- `addBackButton` ✅
- `determineRoleByPositionAndDepartment` ✅
- `saveUserRole` ✅
- `processVacationRequest` ✅
- `processEmergencyVacationRequest` ✅
- `processRemoteRequest` ✅
- `processLateReport` ✅
- `processSickReport` ✅
- `getRemoteStatsForCurrentMonth` ✅
- `getLateStatsForCurrentMonth` ✅
- `getSickStatsForCurrentMonth` ✅
- `findVacationRowById` ✅
- `batchUpdateRows` ✅

### 3. Тестування

Після заміни всіх викликів:
1. Перевірити, що бот запускається без помилок
2. Перевірити основні функції (відпустки, remote, спізнення, лікарняні)
3. Перевірити реєстрацію
4. Перевірити затвердження заявок (HR/CEO)

## 📝 Приклад заміни

**Було:**
```javascript
if (text === '/vacation') {
  await showVacationMenu(chatId, telegramId);
}
```

**Стало:**
```javascript
if (text === '/vacation') {
  await vacationHandler.showVacationMenu(chatId, telegramId);
}
```

## ⚠️ Важливо

1. Переконатися, що `initializeModules()` викликається після `initGoogleSheets()`
2. Перевірити, що всі handlers ініціалізовані перед використанням
3. Додати перевірки на наявність handlers перед викликом (якщо потрібно)

## 🎯 Прогрес

- ✅ Імпорти та ініціалізація: 100%
- ⏳ Заміна викликів функцій: 0%
- ⏳ Тестування: 0%

**Загальний прогрес: ~40%**

