/**
 * 🔄 HYBRID SERVER - Можливість переключення між версіями
 * Emergency сервер з можливістю запуску повної версії
 */

require('dotenv').config();
const express = require('express');

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const USE_FULL_VERSION = process.env.USE_FULL_VERSION === 'true';

console.log(`[${new Date().toISOString()}] 🔄 Hybrid HR Bot Server запускається...`);
console.log(`[${new Date().toISOString()}] 📍 PORT: ${PORT}`);
console.log(`[${new Date().toISOString()}] 🔑 BOT_TOKEN: ${BOT_TOKEN ? 'configured' : 'not configured'}`);
console.log(`[${new Date().toISOString()}] 🎯 USE_FULL_VERSION: ${USE_FULL_VERSION}`);

// 🚀 EXPRESS APP
const app = express();
app.use(express.json());

// 🏥 HYBRID HEALTHCHECK
app.get('/', (req, res) => {
  const userAgent = req.get('User-Agent') || '';
  const isRailwayHealth = userAgent.includes('Railway') || userAgent.includes('railway');
  
  console.log(`[${new Date().toISOString()}] Hybrid health check request`, { 
    userAgent, 
    isRailwayHealth, 
    ip: req.ip,
    url: req.url,
    useFullVersion: USE_FULL_VERSION
  });
  
  if (isRailwayHealth) {
    console.log(`[${new Date().toISOString()}] Railway health check - responding quickly`);
    return res.status(200).json({
      status: 'OK',
      message: 'HR Bot Hybrid Server is running',
      timestamp: new Date().toISOString(),
      version: USE_FULL_VERSION ? '3.0.0-hybrid-full' : '1.0.0-hybrid-emergency',
      mode: USE_FULL_VERSION ? 'full_version' : 'emergency_mode',
      port: PORT,
      bot_token: BOT_TOKEN ? 'configured' : 'not configured'
    });
  }
  
  console.log(`[${new Date().toISOString()}] Regular health check`);
  res.status(200).json({
    status: 'OK',
    message: 'HR Bot Hybrid Server is running',
    timestamp: new Date().toISOString(),
    version: USE_FULL_VERSION ? '3.0.0-hybrid-full' : '1.0.0-hybrid-emergency',
    mode: USE_FULL_VERSION ? 'full_version' : 'emergency_mode',
    port: PORT,
    bot_token: BOT_TOKEN ? 'configured' : 'not configured'
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: USE_FULL_VERSION ? '3.0.0-hybrid-full' : '1.0.0-hybrid-emergency',
    mode: USE_FULL_VERSION ? 'full_version' : 'emergency_mode',
    uptime: process.uptime()
  });
});

// 🔄 SWITCH ENDPOINT - для переключення між версіями
app.post('/switch-to-full', (req, res) => {
  console.log(`[${new Date().toISOString()}] 🔄 Switching to full version requested`);
  res.status(200).json({
    status: 'OK',
    message: 'Switching to full version...',
    timestamp: new Date().toISOString(),
    instruction: 'Set 
USE_FULL_VERSION=true in Railway environment variables'
  });
});

app.post('/switch-to-emergency', (req, res) => {
  console.log(`[${new Date().toISOString()}] 🔄 Switching to emergency version requested`);
  res.status(200).json({
    status: 'OK',
    message: 'Switching to emergency version...',
    timestamp: new Date().toISOString(),
    instruction: 'Set USE_FULL_VERSION=false in Railway environment variables'
  });
});

// 🚀 START SERVER
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] 🚀 Hybrid HR Bot Server запущено на порту ${PORT}`);
  console.log(`[${new Date().toISOString()}] 📍 Health check: http://localhost:${PORT}/`);
  console.log(`[${new Date().toISOString()}] 🎯 Mode: ${USE_FULL_VERSION ? 'FULL VERSION' : 'EMERGENCY MODE'}`);
  
  if (USE_FULL_VERSION) {
    console.log(`[${new Date().toISOString()}] 🔄 Attempting to load full version...`);
    try {
      // Спробуємо завантажити повну версію
      require('./HR_Bot_Complete_Ultimate.js');
      console.log(`[${new Date().toISOString()}] ✅ Full version loaded successfully!`);
    } catch (error) {
      console.log(`[${new Date().toISOString()}] ❌ Failed to load full version:`, error.message);
      console.log(`[${new Date().toISOString()}] 🔄 Falling back to emergency mode`);
    }
  }
});

// 🛡️ ERROR HANDLING
process.on('uncaughtException', (error) => {
  console.error(`[${new Date().toISOString()}] ❌ Uncaught Exception:`, error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`[${new Date().toISOString()}] ❌ Unhandled Rejection at:`, promise, 'reason:', reason);
});

