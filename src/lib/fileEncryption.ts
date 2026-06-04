import crypto from 'crypto';

// Encryption levels
export const ENCRYPTION_LEVELS = {
  NONE: 0,
  BASIC: 1,
  STANDARD: 2,
  MAX: 3,
};

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// SECURITY FIX: Remove fallback random key generation
// Key MUST be provided via environment variable
const MASTER_KEY_HEX = process.env.FILE_ENCRYPTION_KEY;

if (!MASTER_KEY_HEX) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SECURITY ERROR: FILE_ENCRYPTION_KEY is required in production');
  }
  console.warn('WARNING: FILE_ENCRYPTION_KEY not set. File encryption disabled.');
}

// SECURITY FIX: Validate key format and length
let KEY_BUFFER: Buffer | null = null;
if (MASTER_KEY_HEX) {
  if (MASTER_KEY_HEX.length !== KEY_LENGTH * 2) {
    throw new Error(`SECURITY ERROR: FILE_ENCRYPTION_KEY must be ${KEY_LENGTH * 2} hex characters (${KEY_LENGTH} bytes)`);
  }
  if (!/^[0-9a-fA-F]+$/.test(MASTER_KEY_HEX)) {
    throw new Error('SECURITY ERROR: FILE_ENCRYPTION_KEY must be a valid hex string');
  }
  KEY_BUFFER = Buffer.from(MASTER_KEY_HEX, 'hex');
}

export interface EncryptedData {
  data: Buffer;
  iv: string;
  authTag: string;
  level: number;
}

export interface DecryptedData {
  data: Buffer;
  level: number;
}

/**
 * Encrypt file buffer with specified encryption level
 * SECURITY FIX: Removed double encryption layer (AES-128-CBC was weak)
 */
export function encryptFile(buffer: Buffer, level: number = ENCRYPTION_LEVELS.STANDARD): EncryptedData {
  if (level === ENCRYPTION_LEVELS.NONE || !KEY_BUFFER) {
    return { data: buffer, iv: '', authTag: '', level: 0 };
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY_BUFFER, iv);
  
  let encrypted = cipher.update(buffer);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  
  const authTag = cipher.getAuthTag();

  // SECURITY FIX: Removed weak second encryption layer
  // AES-256-GCM provides authenticated encryption, no need for double encryption

  return {
    data: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    level,
  };
}

/**
 * Decrypt file buffer
 * SECURITY FIX: Removed double decryption layer
 */
export function decryptFile(encrypted: EncryptedData): DecryptedData {
  if (encrypted.level === ENCRYPTION_LEVELS.NONE || !KEY_BUFFER) {
    return { data: encrypted.data, level: 0 };
  }

  const iv = Buffer.from(encrypted.iv, 'hex');
  const authTag = Buffer.from(encrypted.authTag, 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY_BUFFER, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted.data);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return {
    data: decrypted,
    level: encrypted.level,
  };
}

/**
 * Generate file encryption key for user-specific encryption
 * SECURITY FIX: Use proper key derivation function
 */
export function generateUserKey(userId: string): string {
  if (!KEY_BUFFER) {
    throw new Error('SECURITY ERROR: Cannot generate user key without master key');
  }
  
  // SECURITY FIX: Use PBKDF2 instead of simple SHA-256
  // This provides better security and prevents rainbow table attacks
  const salt = Buffer.from('нексо-user-key-salt-v1'); // In production, use unique salt per user
  const iterations = 100000; // OWASP recommendation
  const keyLength = 32;
  
  const derivedKey = crypto.pbkdf2Sync(
    userId + KEY_BUFFER.toString('hex'),
    salt,
    iterations,
    keyLength,
    'sha256'
  );
  
  return derivedKey.toString('hex');
}

/**
 * Get encryption level name
 */
export function getEncryptionLevelName(level: number): string {
  switch (level) {
    case ENCRYPTION_LEVELS.NONE: return 'Без шифрования';
    case ENCRYPTION_LEVELS.BASIC: return 'Базовое (AES-128)';
    case ENCRYPTION_LEVELS.STANDARD: return 'Стандартное (AES-256-GCM)';
    case ENCRYPTION_LEVELS.MAX: return 'Максимальное (AES-256-GCM)';
    default: return 'Неизвестно';
  }
}

/**
 * Check if encryption is available
 */
export function isEncryptionAvailable(): boolean {
  return KEY_BUFFER !== null;
}
