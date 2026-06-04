import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';
import { prisma } from '../db';

export interface AuthRequest extends Request {
  userId?: string;
  isAdmin?: boolean;
  adminToken?: string;
  user?: { id: string };
}

// SECURITY FIX: Хранилище для отозванных токенов (в продакшене использовать Redis)
const revokedTokens = new Set<string>();

// SECURITY FIX: Хранилище для попыток входа
interface LoginAttempt {
  count: number;
  lastAttempt: Date;
  lockedUntil?: Date;
}
const loginAttempts = new Map<string, LoginAttempt>();

// SECURITY FIX: Хранилище админ-сессий с временем истечения
interface AdminSession {
  token: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  lastActivity: Date;
}
export const adminSessions = new Map<string, AdminSession>();

// Очистка истекших сессий каждые 5 минут
setInterval(() => {
  const now = new Date();
  for (const [token, session] of adminSessions.entries()) {
    if (session.expiresAt < now) {
      adminSessions.delete(token);
      console.log('[Auth] Expired admin session removed');
    }
  }
}, 5 * 60 * 1000);

/**
 * SECURITY FIX: Проверка блокировки аккаунта
 */
export function checkAccountLockout(identifier: string): { locked: boolean; remainingTime?: number } {
  const attempt = loginAttempts.get(identifier);
  
  if (!attempt || !attempt.lockedUntil) {
    return { locked: false };
  }
  
  const now = new Date();
  if (attempt.lockedUntil > now) {
    const remainingMs = attempt.lockedUntil.getTime() - now.getTime();
    return { locked: true, remainingTime: Math.ceil(remainingMs / 1000 / 60) };
  }
  
  // Блокировка истекла, сбрасываем счётчик
  loginAttempts.delete(identifier);
  return { locked: false };
}

/**
 * SECURITY FIX: Регистрация неудачной попытки входа
 */
export function recordFailedLogin(identifier: string): void {
  const attempt = loginAttempts.get(identifier) || { count: 0, lastAttempt: new Date() };
  
  attempt.count++;
  attempt.lastAttempt = new Date();
  
  // Блокировка после превышения лимита
  if (attempt.count >= config.maxLoginAttempts) {
    attempt.lockedUntil = new Date(Date.now() + config.lockoutDurationMinutes * 60 * 1000);
    console.log(`[Auth] Account locked: ${identifier} for ${config.lockoutDurationMinutes} minutes`);
  }
  
  loginAttempts.set(identifier, attempt);
}

/**
 * SECURITY FIX: Сброс счётчика попыток после успешного входа
 */
export function resetLoginAttempts(identifier: string): void {
  loginAttempts.delete(identifier);
}

/**
 * SECURITY FIX: Отзыв токена
 */
export function revokeToken(token: string): void {
  revokedTokens.add(token);
  // В продакшене сохранять в Redis с TTL = время жизни токена
}

/**
 * SECURITY FIX: Проверка отозванного токена
 */
function isTokenRevoked(token: string): boolean {
  return revokedTokens.has(token);
}

/**
 * Middleware для аутентификации пользователей
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }

  // SECURITY FIX: Проверка отозванного токена
  if (isTokenRevoked(token)) {
    res.status(401).json({ error: 'Токен отозван' });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string; iat: number };
    
    // SECURITY FIX: Проверка времени жизни токена (дополнительная защита)
    const tokenAge = Date.now() / 1000 - decoded.iat;
    const maxAge = config.sessionTimeoutHours * 60 * 60;
    if (tokenAge > maxAge) {
      res.status(401).json({ error: 'Токен истёк' });
      return;
    }
    
    (req as AuthRequest).userId = decoded.userId;
    (req as AuthRequest).user = { id: decoded.userId };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Недействительный токен' });
    return;
  }
}

/**
 * SECURITY FIX: Улучшенная аутентификация для админов
 */
export function authenticateTokenOrAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }

  // Проверка админ-токена
  if (token.startsWith('admin-token-')) {
    const session = adminSessions.get(token);
    
    if (!session) {
      res.status(401).json({ error: 'Недействительный админ-токен. Пожалуйста, войдите снова.' });
      return;
    }
    
    // Проверка истечения сессии
    const now = new Date();
    if (session.expiresAt < now) {
      adminSessions.delete(token);
      res.status(401).json({ error: 'Сессия истекла. Пожалуйста, войдите снова.' });
      return;
    }
    
    // SECURITY FIX: Проверка неактивности (автоматический выход через 1 час неактивности)
    const inactiveMinutes = (now.getTime() - session.lastActivity.getTime()) / 1000 / 60;
    if (inactiveMinutes > 60) {
      adminSessions.delete(token);
      res.status(401).json({ error: 'Сессия истекла из-за неактивности.' });
      return;
    }
    
    // Обновление времени последней активности
    session.lastActivity = now;
    
    (req as AuthRequest).adminToken = token;
    (req as AuthRequest).isAdmin = true;
    (req as AuthRequest).userId = session.userId;
    (req as AuthRequest).user = { id: session.userId };
    next();
    return;
  }

  // Проверка JWT токена
  if (isTokenRevoked(token)) {
    res.status(401).json({ error: 'Токен отозван' });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string; iat: number };
    
    // Проверка времени жизни токена
    const tokenAge = Date.now() / 1000 - decoded.iat;
    const maxAge = config.sessionTimeoutHours * 60 * 60;
    if (tokenAge > maxAge) {
      res.status(401).json({ error: 'Токен истёк' });
      return;
    }
    
    (req as AuthRequest).userId = decoded.userId;
    (req as AuthRequest).user = { id: decoded.userId };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Недействительный токен' });
    return;
  }
}

/**
 * SECURITY FIX: Создание админ-сессии
 */
export function createAdminSession(userId: string): string {
  const token = `admin-token-${Date.now()}-${crypto.randomBytes(32).toString('hex')}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 часа
  
  const session: AdminSession = {
    token,
    userId,
    createdAt: now,
    expiresAt,
    lastActivity: now,
  };
  
  adminSessions.set(token, session);
  
  console.log(`[Auth] Admin session created for user ${userId}, expires at ${expiresAt.toISOString()}`);
  
  return token;
}

/**
 * SECURITY FIX: Удаление админ-сессии (выход)
 */
export function deleteAdminSession(token: string): void {
  adminSessions.delete(token);
  console.log('[Auth] Admin session deleted');
}

/**
 * SECURITY FIX: Проверка прав администратора
 */
export async function isUserAdmin(userId: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, id: true },
    });
    
    // SECURITY FIX: Проверка по email (в будущем заменить на role-based access control)
    return user?.email === 'admin@нексо.com';
  } catch (error) {
    console.error('[Auth] Error checking admin status:', error);
    return false;
  }
}

// Алиас для обратной совместимости
export const auth = authenticateToken;
