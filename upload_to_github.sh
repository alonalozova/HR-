#!/bin/bash

# GitHub API upload script
GITHUB_TOKEN="YOUR_GITHUB_TOKEN_HERE"
REPO_OWNER="alonalozova"
REPO_NAME="HR-"
API_URL="https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/contents"

echo "🚀 Завантаження файлів на GitHub..."

# Функція для завантаження файлу
upload_file() {
    local file_path="$1"
    local file_name=$(basename "$file_path")
    
    if [ -f "$file_path" ]; then
        echo "📤 Завантаження: $file_name"
        
        # Кодуємо файл в base64
        local content=$(base64 -i "$file_path")
        
        # Створюємо JSON payload
        local json_payload=$(cat <<EOF
{
  "message": "Add $file_name",
  "content": "$content"
}
EOF
)
        
        # Відправляємо запит до GitHub API
        local response=$(curl -s -X PUT \
            -H "Authorization: token $GITHUB_TOKEN" \
            -H "Content-Type: application/json" \
            -d "$json_payload" \
            "$API_URL/$file_name")
        
        # Перевіряємо результат
        if echo "$response" | grep -q '"sha"'; then
            echo "✅ $file_name завантажено успішно"
        else
            echo "❌ Помилка завантаження $file_name"
            echo "$response"
        fi
    else
        echo "⚠️ Файл $file_path не знайдено"
    fi
}

# Список файлів для завантаження
files=(
    "server.js"
    "package.json"
    "env.example"
    ".gitignore"
    "railway.json"
    "README.md"
    "DEPLOY.md"
    "HR_Bot_Complete_Final.js"
)

# Завантажуємо кожен файл
for file in "${files[@]}"; do
    upload_file "$file"
    sleep 1  # Пауза між запитами
done

echo "🎉 Завантаження завершено!"
echo "🔗 Перевірте: https://github.com/$REPO_OWNER/$REPO_NAME"

