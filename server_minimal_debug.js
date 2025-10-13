/**
 * МІНІМАЛЬНИЙ СЕРВЕР ДЛЯ ДІАГНОСТИКИ RAILWAY
 * Тільки healthcheck та базові endpoint'и
 */

require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Health check endpoints
app.get('/', (req, res) => {
  console.log('✅ Health check запит отримано');
  res.status(200).json({
    status: 'OK',
    message: 'HR Bot Ultimate is running',
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

app.get('/health', (req, res) => {
  console.log('✅ Health endpoint запит отримано');
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

// Webhook endpoint (пустий)
app.post('/webhook', (req, res) => {
  console.log('📨 Webhook запит отримано');
  res.status(200).json({ status: 'received' });
});

// Обробка помилок
app.use((error, req, res, next) => {
  console.error('❌ Помилка сервера:', error);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Запуск сервера
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Мінімальний сервер запущено на порту ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/`);
  console.log(`📍 Health endpoint: http://localhost:${PORT}/health`);
  console.log(`📨 Webhook: http://localhost:${PORT}/webhook`);
});

// Обробка помилок сервера
server.on('error', (error) => {
  console.error('❌ Помилка сервера:', error);
});

// Обробка глобальних помилок
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

console.log('✅ Мінімальний сервер запущено успішно');
