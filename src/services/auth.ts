import { config } from '../config';
import { store } from '../lib/redis';

// ═══════════════════════════════════════════════════════════════════
// KEY PREFIXES
// ═══════════════════════════════════════════════════════════════════
const KEYS = {
  revokedToken: (jti: string) => `nexo:revoked:${jti}`,
  refreshToken: (jti: string) => `nexo:refresh:${jti}`,
  loginAttempts: (id: string) => `nexo:login_attempts:${id}`,
  lockout: (id: string) => `nexo:lockout:${id}`,
  adminSession: (token: string) => `nexo:admin_session:${token}`,
  csrfToken: (userId: string) => `nexo:csrf:${userId}`,
};

// ═══════════════════════════════════════════════════════════════════
// TOKEN REVOCATION (Redis-backed)
// ═══════════════════════════════════════════════════════════════════

export async function revokeToken(jti: string, ttlSeconds: number): Promise<void> {
  await store.set(KEYS.revokedToken(jti), '1', ttlSeconds);
}

export async function isTokenRevoked(jti: string): Promise<boolean> {
  return store.exists(KEYS.revokedToken(jti));
}

// ═══════════════════════════════════════════════════════════════════
// REFRESH TOKENS (Redis-backed)
// ═══════════════════════════════════════════════════════════════════

interface RefreshTokenData {
  userId: string;
  jti: string;
  fakeMode?: boolean;
  createdAt: number;
}

export async function storeRefreshToken(
  jti: string,
  userId: string,
  ttlSeconds: number,
  fakeMode?: boolean,
): Promise<void> {
  const data: RefreshTokenData = {
    userId,
    jti,
    fakeMode: fakeMode || false,
    createdAt: Date.now(),
  };
  await store.set(KEYS.refreshToken(jti), JSON.stringify(data), ttlSeconds);
}

export async function validateRefreshToken(jti: string): Promise<RefreshTokenData | null> {
  const raw = await store.get(KEYS.refreshToken(jti));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function deleteRefreshToken(jti: string): Promise<void> {
  await store.del(KEYS.refreshToken(jti));
}

export async function revokeAllUserRefreshTokens(userId: string): Promise<void> {
  // Удаляем все refresh tokens для пользователя
  const keys = await store.getAllHash(`nexo:user_refresh:${userId}`);
  for (const jti of Object.keys(keys)) {
    await store.del(KEYS.refreshToken(jti));
  }
  await store.del(`nexo:user_refresh:${userId}`);
}

export async function registerRefreshToken(userId: string, jti: string): Promise<void> {
  await store.setHash(`nexo:user_refresh:${userId}`, jti, '1');
}

// ═══════════════════════════════════════════════════════════════════
// LOGIN ATTEMPTS & LOCKOUT (Redis-backed)
// ═══════════════════════════════════════════════════════════════════

export async function checkAccountLockout(identifier: string): Promise<{ locked: boolean; remainingTime?: number }> {
  const lockedUntil = await store.get(KEYS.lockout(identifier));
  if (!lockedUntil) return { locked: false };
  
  const expiresAt = parseInt(lockedUntil, 10);
  const now = Date.now();
  
  if (now < expiresAt) {
    return { locked: true, remainingTime: Math.ceil((expiresAt - now) / 1000 / 60) };
  }
  
  // Lockout expired
  await store.del(KEYS.lockout(identifier));
  await store.del(KEYS.loginAttempts(identifier));
  return { locked: false };
}

export async function recordFailedLogin(identifier: string): Promise<void> {
  const key = KEYS.loginAttempts(identifier);
  const count = await store.incr(key);
  
  // Set TTL for the counter (lockout duration * 2 for safety)
  if (count === 1) {
    await store.expire(key, config.lockoutDurationMinutes * 60 * 2);
  }
  
  if (count >= config.maxLoginAttempts) {
    const lockUntil = Date.now() + config.lockoutDurationMinutes * 60 * 1000;
    await store.set(KEYS.lockout(identifier), String(lockUntil), config.lockoutDurationMinutes * 60);
    console.log(`[Auth] Account locked: ${identifier} for ${config.lockoutDurationMinutes} minutes`);
  }
}

export async function resetLoginAttempts(identifier: string): Promise<void> {
  await store.del(KEYS.loginAttempts(identifier));
}

// ═══════════════════════════════════════════════════════════════════
// ADMIN SESSIONS (Redis-backed)
// ═══════════════════════════════════════════════════════════════════

export interface AdminSessionData {
  token: string;
  ip: string;
  userAgent: string;
  device: string;
  loginAt: number;
  lastActivity: number;
  expiresAt: number;
}

export async function createAdminSession(token: string, data: Omit<AdminSessionData, 'token' | 'loginAt' | 'lastActivity' | 'expiresAt'>): Promise<AdminSessionData> {
  const now = Date.now();
  const session: AdminSessionData = {
    token,
    ip: data.ip,
    userAgent: data.userAgent,
    device: data.device,
    loginAt: now,
    lastActivity: now,
    expiresAt: now + 24 * 60 * 60 * 1000,
  };
  
  await store.set(KEYS.adminSession(token), JSON.stringify(session), 24 * 60 * 60);
  return session;
}

export async function getAdminSession(token: string): Promise<AdminSessionData | null> {
  const raw = await store.get(KEYS.adminSession(token));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function updateAdminSessionActivity(token: string): Promise<void> {
  const session = await getAdminSession(token);
  if (!session) return;
  session.lastActivity = Date.now();
  await store.set(KEYS.adminSession(token), JSON.stringify(session), 24 * 60 * 60);
}

export async function deleteAdminSession(token: string): Promise<void> {
  await store.del(KEYS.adminSession(token));
}

// ═══════════════════════════════════════════════════════════════════
// ADMIN LOGIN ATTEMPTS (Redis-backed)
// ═══════════════════════════════════════════════════════════════════

const ADMIN_LOCKOUT_KEY = (ip: string) => `nexo:admin_lockout:${ip}`;
const ADMIN_ATTEMPTS_KEY = (ip: string) => `nexo:admin_attempts:${ip}`;

export async function checkAdminLockout(ip: string): Promise<{ locked: boolean; remainingTime?: number }> {
  const lockedUntil = await store.get(ADMIN_LOCKOUT_KEY(ip));
  if (!lockedUntil) return { locked: false };
  
  const expiresAt = parseInt(lockedUntil, 10);
  const now = Date.now();
  
  if (now < expiresAt) {
    return { locked: true, remainingTime: Math.ceil((expiresAt - now) / 1000 / 60) };
  }
  
  await store.del(ADMIN_LOCKOUT_KEY(ip));
  await store.del(ADMIN_ATTEMPTS_KEY(ip));
  return { locked: false };
}

export async function recordAdminFailedLogin(ip: string): Promise<void> {
  const key = ADMIN_ATTEMPTS_KEY(ip);
  const count = await store.incr(key);
  
  if (count === 1) {
    await store.expire(key, 60 * 60 * 2);
  }
  
  if (count >= 3) {
    const lockUntil = Date.now() + 60 * 60 * 1000; // 1 hour
    await store.set(ADMIN_LOCKOUT_KEY(ip), String(lockUntil), 60 * 60);
    console.log(`[Admin] IP locked: ${ip} for 60 minutes`);
  }
}

export async function resetAdminLoginAttempts(ip: string): Promise<void> {
  await store.del(ADMIN_ATTEMPTS_KEY(ip));
}

// ═══════════════════════════════════════════════════════════════════
// RATE LIMITING (Redis-backed)
// ═══════════════════════════════════════════════════════════════════

const RATE_LIMIT_KEY = (key: string) => `nexo:ratelimit:${key}`;

// ═══════════════════════════════════════════════════════════════════
// VERIFICATION CODES (Redis-backed)
// ═══════════════════════════════════════════════════════════════════

const VERIFICATION_CODE_KEY = (phone: string) => `nexo:verify_code:${phone}`;

export async function storeVerificationCode(phone: string, code: string, ttlSeconds: number): Promise<void> {
  await store.set(VERIFICATION_CODE_KEY(phone), code, ttlSeconds);
}

export async function getVerificationCode(phone: string): Promise<string | null> {
  return store.get(VERIFICATION_CODE_KEY(phone));
}

export async function deleteVerificationCode(phone: string): Promise<void> {
  await store.del(VERIFICATION_CODE_KEY(phone));
}

export async function checkRateLimit(key: string, maxRequests: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number; retryAfter?: number }> {
  const redisKey = RATE_LIMIT_KEY(key);
  const current = await store.incr(redisKey);
  
  if (current === 1) {
    await store.expire(redisKey, windowSeconds);
  }
  
  if (current > maxRequests) {
    const ttl = await store.ttl(redisKey);
    return { allowed: false, remaining: 0, retryAfter: ttl > 0 ? ttl : windowSeconds };
  }
  
  return { allowed: true, remaining: maxRequests - current };
}
