/**
 * 🏢 HR БОТ - МІНІМАЛЬНА ВЕРСІЯ ДЛЯ ТЕСТУВАННЯ
 * Тільки healthcheck, без складної логіки
 */

require('dotenv').config();
const express = require('express');

// ⚙️ НАЛАШТУВАННЯ
const PORT = process.env.PORT || 3000;

// 🤖 ІНІЦІАЛІЗАЦІЯ
const app = express();

// 🚀 EXPRESS
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  console.log('Health check requested');
  res.status(200).json({
    status: 'OK',
    message: 'HR Bot is running (minimal version)',
    timestamp: new Date().toISOString(),
    version: '1.0.0-minimal',
    uptime: process.uptime()
  });
});

// Додатковий health check
app.get('/health', (req, res) => {
  console.log('Health endpoint requested');
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Простий webhook endpoint
app.post('/webhook', (req, res) => {
  console.log('Webhook received');
  res.status(200).send('OK');
});

// Запуск сервера
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Minimal HR Bot запущено на порту ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/`);
  console.log(`📍 Health endpoint: http://localhost:${PORT}/health`);
});

// Обробка помилок
server.on('error', (error) => {
  console.error('❌ Помилка сервера:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

console.log('✅ Minimal server started successfully');

