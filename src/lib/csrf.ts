import crypto from 'crypto';
import { config } from '../config';

const CSRF_SECRET = config.csrfSecret || crypto.randomBytes(32).toString('hex');
const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = 'nexo_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Генерация CSRF токена
 */
export function generateCsrfToken(): string {
  const randomBytes = crypto.randomBytes(CSRF_TOKEN_LENGTH);
  const signature = crypto
    .createHmac('sha256', CSRF_SECRET)
    .update(randomBytes)
    .digest('hex');
  return `${randomBytes.toString('hex')}.${signature}`;
}

/**
 * Валидация CSRF токена
 */
export function validateCsrfToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  
  const [randomHex, signature] = parts;
  if (randomHex.length !== CSRF_TOKEN_LENGTH * 2) return false;
  
  const expectedSignature = crypto
    .createHmac('sha256', CSRF_SECRET)
    .update(Buffer.from(randomHex, 'hex'))
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

export const CSRF_CONFIG = {
  COOKIE_NAME: CSRF_COOKIE_NAME,
  HEADER_NAME: CSRF_HEADER_NAME,
  MAX_AGE: 60 * 60 * 24, // 24 часа в секундах
};
