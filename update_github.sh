#!/bin/bash

GITHUB_TOKEN="YOUR_GITHUB_TOKEN_HERE"
REPO_OWNER="alonalozova"
REPO_NAME="HR-"

echo "🔄 Оновлення файлів на GitHub..."

# Функція для оновлення файлу
update_file() {
    local file_path="$1"
    local file_name=$(basename "$file_path")
    
    echo "📤 Оновлення: $file_name"
    
    # Отримуємо SHA існуючого файлу
    local sha=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
        "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/contents/$file_name" | \
        grep -o '"sha":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    # Кодуємо файл в base64
    local content=$(base64 -i "$file_path" | tr -d '\n')
    
    # Відправляємо запит
    local response=$(curl -s -X PUT \
        -H "Authorization: token $GITHUB_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"message\":\"Update $file_name\",\"content\":\"$content\",\"sha\":\"$sha\"}" \
        "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/contents/$file_name")
    
    if echo "$response" | grep -q '"sha"'; then
        echo "✅ $file_name оновлено успішно"
    else
        echo "❌ Помилка оновлення $file_name"
    fi
}

# Оновлюємо файли
update_file "server.js"
update_file "package.json"

echo "🎉 Оновлення завершено!"

