#!/bin/bash
# Скрипт для налаштування токену GitHub

echo "🔐 Налаштування GitHub токену для push"
echo ""
echo "📝 Інструкція:"
echo "1. Відкрийте: https://github.com/settings/tokens/new?type=beta"
echo "2. Натисніть 'Tokens (classic)' в лівому меню"
echo "3. 'Generate new token' → 'Generate new token (classic)'"
echo "4. Заповніть: Note: 'HR Bot Deploy', права: ✅ repo"
echo "5. Скопіюйте токен (починається з ghp_...)"
echo ""
read -p "Вставте ваш токен тут і натисніть Enter: " TOKEN

if [ -z "$TOKEN" ]; then
    echo "❌ Токен не введено!"
    exit 1
fi

echo ""
echo "🔄 Налаштування remote URL з токеном..."
git remote set-url origin https://${TOKEN}@github.com/alonalozova/HR-.git

echo ""
echo "✅ Токен налаштовано!"
echo ""
echo "🚀 Тепер робимо push..."
git push origin main

echo ""
echo "✅ Готово!"


