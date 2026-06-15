import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';
import { prisma } from '../db';
import { isTokenRevoked, getAdminSession, updateAdminSessionActivity } from '../services/auth';

export interface AuthRequest extends Request {
  userId?: string;
  isAdmin?: boolean;
  adminToken?: string;
  user?: { id: string };
  fakeMode?: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// JWT HELPERS
// ═══════════════════════════════════════════════════════════════════

export interface AccessTokenPayload {
  userId: string;
  jti: string;
  fakeMode?: boolean;
  type: 'access';
}

export interface RefreshTokenPayload {
  userId: string;
  jti: string;
  type: 'refresh';
}

/**
 * Генерация access token (короткоживущий, в cookie)
 */
export function generateAccessToken(userId: string, fakeMode?: boolean): { token: string; jti: string } {
  const jti = crypto.randomUUID();
  const payload: AccessTokenPayload = {
    userId,
    jti,
    fakeMode: fakeMode || undefined,
    type: 'access',
  };
  const token = jwt.sign(payload, config.jwtSecret, {
    expiresIn: `${config.accessTokenTtlMinutes}m`,
  });
  return { token, jti };
}

/**
 * Генерация refresh token (долгоживущий, в cookie)
 */
export function generateRefreshToken(userId: string): { token: string; jti: string } {
  const jti = crypto.randomUUID();
  const payload: RefreshTokenPayload = {
    userId,
    jti,
    type: 'refresh',
  };
  const token = jwt.sign(payload, config.jwtRefreshSecret, {
    expiresIn: `${config.refreshTokenTtlDays}d`,
  });
  return { token, jti };
}

/**
 * Установка auth cookies.
 * Access token — httpOnly (недоступен из JS, защищён от XSS).
 * Refresh token — httpOnly (только для API обновления).
 */
export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  // Access token — httpOnly для защиты от XSS атак
  res.cookie('nexo_access_token', accessToken, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: config.accessTokenTtlMinutes * 60 * 1000,
  });

  // Refresh token — httpOnly (недоступен из JS)
  res.cookie('nexo_refresh_token', refreshToken, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: config.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  });
}

/**
 * Очистка auth cookies
 */
export function clearAuthCookies(res: Response): void {
  res.clearCookie('nexo_access_token', { path: '/' });
  res.clearCookie('nexo_refresh_token', { path: '/' });
}

/**
 * Извлечение access token из запроса (cookie или Authorization header)
 */
function extractToken(req: Request): string | null {
  // 1. Cookie (приоритет)
  const cookieToken = (req as any).cookies?.nexo_access_token;
  if (cookieToken) return cookieToken;

  // 2. Authorization header (для API-клиентов, socket, etc.)
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    return token || null;
  }

  return null;
}

/**
 * Извлечение refresh token из cookie
 */
function extractRefreshToken(req: Request): string | null {
  return (req as any).cookies?.nexo_refresh_token || null;
}

// ═══════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════

/**
 * Middleware для аутентификации пользователей
 */
export async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AccessTokenPayload;
    
    if (decoded.type !== 'access') {
      res.status(401).json({ error: 'Недействительный тип токена' });
      return;
    }

    // Проверка отозванного токена (Redis-backed)
    if (await isTokenRevoked(decoded.jti)) {
      res.status(401).json({ error: 'Токен отозван' });
      return;
    }
    
    (req as AuthRequest).userId = decoded.userId;
    (req as AuthRequest).user = { id: decoded.userId };
    if (decoded.fakeMode) {
      (req as AuthRequest).fakeMode = true;
    }
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Токен истёк', code: 'TOKEN_EXPIRED' });
      return;
    }
    res.status(401).json({ error: 'Недействительный токен' });
    return;
  }
}

/**
 * Middleware для аутентификации пользователей или админов
 */
export async function authenticateTokenOrAdmin(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }

  // Проверка админ-токена
  if (token.startsWith('admin-token-')) {
    const session = await getAdminSession(token);
    
    if (!session) {
      res.status(401).json({ error: 'Недействительный админ-токен. Пожалуйста, войдите снова.' });
      return;
    }
    
    const now = Date.now();
    if (session.expiresAt < now) {
      res.status(401).json({ error: 'Сессия истекла. Пожалуйста, войдите снова.' });
      return;
    }
    
    const inactiveMinutes = (now - session.lastActivity) / 1000 / 60;
    if (inactiveMinutes > 60) {
      res.status(401).json({ error: 'Сессия истекла из-за неактивности.' });
      return;
    }
    
    await updateAdminSessionActivity(token);
    
    (req as AuthRequest).adminToken = token;
    (req as AuthRequest).isAdmin = true;
    (req as AuthRequest).userId = session.ip; // Admin doesn't have userId
    next();
    return;
  }

  // Проверка JWT токена
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AccessTokenPayload;
    
    if (decoded.type !== 'access') {
      res.status(401).json({ error: 'Недействительный тип токена' });
      return;
    }

    if (await isTokenRevoked(decoded.jti)) {
      res.status(401).json({ error: 'Токен отозван' });
      return;
    }
    
    (req as AuthRequest).userId = decoded.userId;
    (req as AuthRequest).user = { id: decoded.userId };
    if (decoded.fakeMode) {
      (req as AuthRequest).fakeMode = true;
    }
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Токен истёк', code: 'TOKEN_EXPIRED' });
      return;
    }
    res.status(401).json({ error: 'Недействительный токен' });
    return;
  }
}

/**
 * Проверка прав администратора
 */
export async function isUserAdmin(userId: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, id: true },
    });
    return user?.email === 'admin@нексо.com';
  } catch (error) {
    console.error('[Auth] Error checking admin status:', error);
    return false;
  }
}

// Алиас для обратной совместимости
export const auth = authenticateToken;
