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
    // Ищем порт в аргументах командной строки (пропускаем -- и другие флаги)
    const portArg = process.argv.find((arg, i) => i > 1 && /^\d+$/.test(arg));
    return portArg ? Number(portArg) : Number(process.env.PORT) || 3001;
  })(),
  // SECURITY: No fallback for JWT secret in production
  jwtSecret: process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'нексо-dev-fallback-not-for-production'),
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : ['http://localhost:6023', 'http://localhost:3000', 'http://localhost:3001', 'http://192.168.0.136:6023', 'http://192.168.0.136:3001', 'https://nexo.cloudpub.ru'],
  uploadsDir: 'uploads',
  // Минимальная длина пароля
  minPasswordLength: 8,
  maxRegistrationsPerIp: Number(process.env.MAX_REGISTRATIONS_PER_IP) || 10,
  // SECURITY: JWT token lifetime
  sessionTimeoutHours: Number(process.env.SESSION_TIMEOUT_HOURS) || (process.env.NODE_ENV === 'production' ? 72 : 999999),
  turnUrl: process.env.TURN_URL || '',
  turnSecret: process.env.TURN_SECRET || '',
  stunUrls: (process.env.STUN_URLS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302')
    .split(',').map(s => s.trim()).filter(Boolean),
  // Storage mode: only 'local' now
  storageMode: 'local' as const,
  // Database URL - Neon PostgreSQL
  databaseUrl: process.env.DATABASE_URL || '',
  databaseUrlBackup: process.env.DATABASE_URL_BACKUP || '',
  // Redis - primary instance
  redisUrl: process.env.REDIS_URL || '',
  // Redis - secondary instance (for sessions/cache)
  redisSessionUrl: process.env.REDIS_SESSION_URL || '',
  // SECURITY: Session and security settings
  maxLoginAttempts: Number(process.env.MAX_LOGIN_ATTEMPTS) || 5,
  lockoutDurationMinutes: Number(process.env.LOCKOUT_DURATION_MINUTES) || 30,
  // SECURITY: YooKassa webhook secret (required for payment verification)
  yukassaWebhookSecret: process.env.YUKASSA_WEBHOOK_SECRET || process.env.YUKASSA_SECRET_KEY || '',
};

// SECURITY: Validate configuration
if (!config.jwtSecret && process.env.NODE_ENV === 'production') {
  throw new Error('SECURITY ERROR: JWT_SECRET is required in production');
}

// SECURITY: Log security configuration status (without exposing secrets)
console.log('Security Configuration:');
console.log(`  - JWT Secret: ${config.jwtSecret ? '✓ Configured' : '✗ Missing'}`);
console.log(`  - Encryption: ${isEncryptionEnabled() ? '✓ Enabled' : '✗ Disabled'}`);
console.log(`  - Min Password Length: ${config.minPasswordLength} characters`);
console.log(`  - Session Timeout: ${config.sessionTimeoutHours} hours`);
console.log(`  - Max Login Attempts: ${config.maxLoginAttempts}`);
console.log(`  - Lockout Duration: ${config.lockoutDurationMinutes} minutes`);
console.log(`  - YooKassa Webhook Secret: ${config.yukassaWebhookSecret ? '✓ Configured' : '✗ Missing (payments will fail)'}`);
