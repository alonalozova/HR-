# 🔧 Виправлення автентифікації GitHub

## 🔍 Проблема

Ви використовуєте `osxkeychain` credential helper, який зберігає облікові дані в macOS Keychain. Можливо там збережений старий пароль або неправильний токен.

---

## ✅ Рішення: Оновити credentials в Keychain

### Варіант 1: Видалити старі credentials (рекомендовано)

1. **Відкрийте Keychain Access:**
   - Натисніть `Cmd + Space`
   - Введіть "Keychain Access"
   - Натисніть Enter

2. **Знайдіть GitHub credentials:**
   - В пошуку введіть: `github.com`
   - Знайдіть записи типу "Internet password" для `github.com`

3. **Видаліть старі записи:**
   - Оберіть запис
   - Натисніть `Delete` або клацніть правою кнопкою → "Delete"

4. **Тепер спробуйте push знову:**
   ```bash
   cd "/Users/alonalozova/Desktop/ЧАТ БОТ для HR"
   git push origin main
   ```

5. **Коли попросить credentials:**
   - Username: ваш GitHub username (або `alonalozova`)
   - Password: ваш Personal Access Token (починається з `ghp_...`)

---

### Варіант 2: Використати токен прямо в URL

```bash
cd "/Users/alonalozova/Desktop/ЧАТ БОТ для HR"

# Замініть YOUR_TOKEN на ваш токен
git remote set-url origin https://YOUR_TOKEN@github.com/alonalozova/HR-.git

# Тепер push має працювати
git push origin main
```

**Приклад:**
```bash
git remote set-url origin https://ghp_abc123xyz@github.com/alonalozova/HR-.git
git push origin main
```

---

### Варіант 3: Використати SSH (якщо вже налаштовано)

```bash
cd "/Users/alonalozova/Desktop/ЧАТ БОТ для HR"

# Змінити на SSH
git remote set-url origin git@github.com:alonalozova/HR-.git

# Тест SSH
ssh -T git@github.com

# Якщо працює, робимо push
git push origin main
```

---

## 🧪 Перевірка після виправлення

```bash
cd "/Users/alonalozova/Desktop/ЧАТ БОТ для HR"

# Перевірка remote URL
git remote -v

# Тест push
git push origin main
```

Якщо все ОК, ви побачите:
```
Enumerating objects: X, done.
Counting objects: 100% (X/X), done.
Writing objects: 100% (X/X), done.
To https://github.com/alonalozova/HR-.git
   abc123..def456  main -> main
```

---

## 🆘 Якщо все ще не працює

1. Перевірте чи токен правильний
2. Перевірте чи маєте права доступу до репозиторію
3. Спробуйте створити новий токен
4. Переконайтеся що репозиторій існує на GitHub

---

**Рекомендація:** Почніть з Варіанту 1 (видалити старі credentials), це найчистіший спосіб.


