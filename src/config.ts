import dotenv from 'dotenv';
import path from 'path';
import { initEncryption, isEncryptionEnabled } from './encrypt';

dotenv.config({ path: path.join(__dirname, '../.env') });

// SECURITY: Enforce required environment variables in production
if (process.env.NODE_ENV === 'production') {
  const requiredEnvVars = [
    'JWT_SECRET',
    'DATABASE_URL',
    'ENCRYPTION_KEY',
    'ADMIN_PASSWORD',
    'CSRF_SECRET',
    'FILE_ENCRYPTION_KEY',
  ];
  
  const missing = requiredEnvVars.filter(varName => !process.env[varName]);
  if (missing.length > 0) {
    throw new Error(`SECURITY ERROR: Missing required environment variables: ${missing.join(', ')}`);
  }
  
  // SECURITY: Validate JWT secret strength
  const jwtSecret = process.env.JWT_SECRET!;
  if (jwtSecret.length < 32) {
    throw new Error('SECURITY ERROR: JWT_SECRET must be at least 32 characters long');
  }
  if (jwtSecret === 'нексо-dev-fallback-not-for-production') {
    throw new Error('SECURITY ERROR: Cannot use default JWT_SECRET in production');
  }
  
  // SECURITY: Validate admin password strength
  const adminPassword = process.env.ADMIN_PASSWORD!;
  if (adminPassword.length < 16) {
    throw new Error('SECURITY ERROR: ADMIN_PASSWORD must be at least 16 characters long');
  }
  if (adminPassword === '1234567890qwertyuiop' || adminPassword === 'admin' || adminPassword === 'password') {
    throw new Error('SECURITY ERROR: ADMIN_PASSWORD is too weak or uses default value');
  }
}

// SECURITY: Initialize encryption with validation
if (process.env.ENCRYPTION_KEY) {
  try {
    initEncryption(process.env.ENCRYPTION_KEY);
  } catch (error) {
    console.error('SECURITY ERROR: Invalid ENCRYPTION_KEY format');
    throw error;
  }
} else if (process.env.NODE_ENV === 'production') {
  throw new Error('SECURITY ERROR: ENCRYPTION_KEY is required in production');
}

// Redis instances (comma-separated URLs)
const redisUrlsEnv = process.env.REDIS_URLS || '';
export const REDIS_INSTANCES = redisUrlsEnv
  ? redisUrlsEnv.split(',').map((url, i) => ({ id: `redis${i + 1}`, url: url.trim() }))
  : [];

export const config = {
  port: (() => {
    const portArg = process.argv.find((arg, i) => i > 1 && /^\d+$/.test(arg));
    return portArg ? Number(portArg) : Number(process.env.PORT) || 3001;
  })(),
  jwtSecret: process.env.JWT_SECRET || '',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || '',
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : ['http://localhost:6023', 'http://localhost:3000', 'http://localhost:3001', 'http://192.168.0.136:6023', 'http://192.168.0.136:3001', 'https://nexo.cloudpub.ru'],
  uploadsDir: 'uploads',
  minPasswordLength: 8,
  maxRegistrationsPerIp: Number(process.env.MAX_REGISTRATIONS_PER_IP) || 10,
  sessionTimeoutHours: Number(process.env.SESSION_TIMEOUT_HOURS) || (process.env.NODE_ENV === 'production' ? 72 : 999999),
  accessTokenTtlMinutes: Number(process.env.ACCESS_TOKEN_TTL_MINUTES) || 15,
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 30,
  turnUrl: process.env.TURN_URL || '',
  turnSecret: process.env.TURN_SECRET || '',
  stunUrls: (process.env.STUN_URLS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302')
    .split(',').map(s => s.trim()).filter(Boolean),
  storageMode: 'local' as const,
  databaseUrl: process.env.DATABASE_URL || '',
  databaseUrlBackup: process.env.DATABASE_URL_BACKUP || '',
  redisUrl: process.env.REDIS_URL || '',
  redisSessionUrl: process.env.REDIS_SESSION_URL || '',
  maxLoginAttempts: Number(process.env.MAX_LOGIN_ATTEMPTS) || 5,
  lockoutDurationMinutes: Number(process.env.LOCKOUT_DURATION_MINUTES) || 30,
  yukassaWebhookSecret: process.env.YUKASSA_WEBHOOK_SECRET || process.env.YUKASSA_SECRET_KEY || '',
  cookieDomain: process.env.COOKIE_DOMAIN || '',
  isProduction: process.env.NODE_ENV === 'production',
  // AI Proxy — Cloudflare Worker
  aiProxyUrl: process.env.AI_PROXY_URL || '',
  aiProxySecret: process.env.AI_PROXY_SECRET || '',
  // CSRF & File Encryption
  csrfSecret: process.env.CSRF_SECRET || '',
  fileEncryptionKey: process.env.FILE_ENCRYPTION_KEY || '',
};

// SECURITY: Validate configuration
if (!config.jwtSecret) {
  throw new Error('SECURITY ERROR: JWT_SECRET is required. Set it in .env file.');
}
if (config.jwtSecret.length < 32) {
  throw new Error('SECURITY ERROR: JWT_SECRET must be at least 32 characters long');
}
if (config.jwtSecret === 'change-me-to-a-random-secret') {
  throw new Error('SECURITY ERROR: You must change JWT_SECRET from the default value. Generate a strong random secret.');
}

// Security configuration is displayed in the TUI dashboard (src/lib/tui.ts)

// SECURITY: Validate JWT refresh secret
if (!config.jwtRefreshSecret) {
  throw new Error('SECURITY ERROR: JWT_REFRESH_SECRET is required. Set it in .env file.');
}
if (config.jwtRefreshSecret.length < 32) {
  throw new Error('SECURITY ERROR: JWT_REFRESH_SECRET must be at least 32 characters long');
}
