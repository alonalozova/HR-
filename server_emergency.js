/**
 * 🚨 EMERGENCY SERVER - Мінімальний сервер для Railway
 * Тільки для виправлення healthcheck проблем
 */

require('dotenv').config();
const express = require('express');

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;

// 🚀 EXPRESS APP
const app = express();
app.use(express.json());

// 🏥 EMERGENCY HEALTHCHECK - БЕЗ ВСІХ MIDDLEWARE
app.get('/', (req, res) => {
  // Тимчасово без rate limiting для Railway healthcheck
  const userAgent = req.get('User-Agent') || '';
  const isRailwayHealth = userAgent.includes('Railway') || userAgent.includes('railway');
  
  console.log('Emergency health check request', { 
    userAgent, 
    isRailwayHealth, 
    ip: req.ip,
    url: req.url,
    timestamp: new Date().toISOString()
  });
  
  if (isRailwayHealth) {
    // Швидкий відгук для Railway без rate limiting
    console.log('Railway emergency health check - bypassing all middleware');
    return res.status(200).json({
      status: 'OK',
      message: 'HR Bot Emergency Server is running',
      timestamp: new Date().toISOString(),
      version: '1.0.0-emergency',
      port: PORT,
      bot_token: BOT_TOKEN ? 'configured' : 'missing'
    });
  }
  
  // Для звичайних запитів
  console.log('Regular emergency health check');
  res.status(200).json({
    status: 'OK',
    message: 'HR Bot Emergency Server is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0-emergency',
    port: PORT,
    bot_token: BOT_TOKEN ? 'configured' : 'missing'
  });
});

// 🏥 ДОДАТКОВИЙ HEALTHCHECK ENDPOINT
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0-emergency',
    uptime: process.uptime()
  });
});

// 🏥 RAILWAY HEALTHCHECK ENDPOINT
app.get('/railway-health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0-emergency'
  });
});

// 🚀 ЗАПУСК СЕРВЕРА
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚨 Emergency HR Bot Server запущено на порту ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/`);
  console.log(`📍 Railway health: http://localhost:${PORT}/railway-health`);
  console.log(`📨 Bot token: ${BOT_TOKEN ? 'configured' : 'missing'}`);
});

console.log('🚨 Emergency server started successfully');
