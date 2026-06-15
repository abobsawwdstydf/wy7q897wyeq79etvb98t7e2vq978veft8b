import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db';
import { config } from '../config';
import { USER_SELECT } from '../shared';
import {
  authenticateToken,
  AuthRequest,
  generateAccessToken,
  generateRefreshToken,
  setAuthCookies,
  clearAuthCookies,
} from '../middleware/auth';
import {
  revokeToken,
  checkAccountLockout,
  recordFailedLogin,
  resetLoginAttempts,
  storeRefreshToken,
  validateRefreshToken,
  deleteRefreshToken,
  revokeAllUserRefreshTokens,
  registerRefreshToken,
} from '../services/auth';
import { validatePassword } from '../lib/password';
import { generateCsrfToken, validateCsrfToken, CSRF_CONFIG } from '../lib/csrf';

const router = Router();

// Stricter rate limiter for login/register to prevent brute-force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Слишком много попыток входа, попробуйте позже' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0];
    if (allowedMimes.includes(file.mimetype) && ext && allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Только изображения (JPEG, PNG, GIF, WebP)'));
    }
  },
});

/**
 * Установка CSRF cookie + токена в response
 */
function setCsrfCookie(res: Response, userId: string): string {
  const token = generateCsrfToken();
  res.cookie(CSRF_CONFIG.COOKIE_NAME, token, {
    httpOnly: false, // Доступен из JS
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: CSRF_CONFIG.MAX_AGE * 1000,
  });
  return token;
}

// ═══════════════════════════════════════════════════════════════════
// РЕГИСТРАЦИЯ
// ═══════════════════════════════════════════════════════════════════

router.post('/register', loginLimiter, upload.single('avatar') as any, async (req: Request, res: Response) => {
  try {
    const { username, displayName, phone, password, bio, birthday } = req.body;
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

    if (!username || !displayName || !phone || !password || !birthday) {
      res.status(400).json({ error: 'Username, имя, телефон, пароль и дата рождения обязательны' });
      return;
    }

    if (!/^[a-zA-Z0-9_.-]{3,17}$/.test(username)) {
      res.status(400).json({ error: 'Username: 3-17 символов, только латиница, цифры и -_.' });
      return;
    }
    if (username.startsWith('.') || username.endsWith('.')) {
      res.status(400).json({ error: 'Точка не может быть в начале или конце username' });
      return;
    }

    if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
      res.status(400).json({ error: 'Телефон в формате +79991234567' });
      return;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      res.status(400).json({ error: passwordValidation.error });
      return;
    }

    const xssPattern = /<script|javascript:|onerror=|onclick=|onload=|<iframe|<object|<embed|data:text\/html/i;
    if (displayName.length > 50 || xssPattern.test(displayName)) {
      res.status(400).json({ error: 'Недопустимое имя' });
      return;
    }
    if (bio && (bio.length > 500 || xssPattern.test(bio))) {
      res.status(400).json({ error: 'Недопустимое описание' });
      return;
    }

    if (birthday) {
      const birthdayDate = new Date(birthday);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      birthdayDate.setHours(0, 0, 0, 0);
      if (birthdayDate >= today) {
        res.status(400).json({ error: 'Дата рождения не может быть сегодня или в будущем' });
        return;
      }
    }

    const existingUsername = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
    if (existingUsername) {
      res.status(400).json({ error: 'Username занят' });
      return;
    }

    const existingPhone = await prisma.user.findFirst({ where: { phone } });
    if (existingPhone) {
      res.status(400).json({ error: 'Этот номер уже зарегистрирован' });
      return;
    }

    let avatarPath: string | null = null;
    if (req.file) {
      const fs = await import('fs');
      const path = await import('path');
      const { UPLOADS_ROOT } = await import('../shared');
      const ext = req.file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
      const randomName = `avatar_${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${ext}`;
      avatarPath = `/uploads/avatars/${randomName}`;
      const dir = path.join(UPLOADS_ROOT, 'avatars');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, randomName), req.file.buffer);
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        username: username.toLowerCase(),
        displayName: displayName.trim(),
        phone,
        phoneVerified: true,
        emailVerified: false,
        password: hashedPassword,
        avatar: avatarPath,
        bio: bio ? bio.slice(0, 500).trim() : null,
        birthday,
        registrationIp: clientIp,
      },
      select: USER_SELECT,
    });

    // Генерируем пару токенов
    const { token: accessToken, jti: accessJti } = generateAccessToken(user.id);
    const { token: refreshToken, jti: refreshJti } = generateRefreshToken(user.id);

    // Сохраняем refresh token в Redis
    await storeRefreshToken(refreshJti, user.id, config.refreshTokenTtlDays * 24 * 60 * 60);
    await registerRefreshToken(user.id, refreshJti);

    // Устанавливаем cookies
    setAuthCookies(res, accessToken, refreshToken);
    setCsrfCookie(res, user.id);

    res.json({ user: { ...user, isOnline: true }, accessToken, csrfToken: generateCsrfToken() });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// ПРОВЕРКА ДОСТУПНОСТИ
// ═══════════════════════════════════════════════════════════════════

router.get('/check-username', async (req, res) => {
  try {
    const { username } = req.query;
    if (!username || typeof username !== 'string') {
      res.status(400).json({ error: 'Username обязателен' });
      return;
    }
    if (!/^[a-zA-Z0-9_.-]{3,17}$/.test(username)) {
      res.json({ available: false, reason: 'invalid' });
      return;
    }
    if (username.startsWith('.') || username.endsWith('.')) {
      res.json({ available: false, reason: 'invalid' });
      return;
    }
    const existing = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
    res.json({ available: !existing });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/check-phone', async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone || typeof phone !== 'string') {
      res.status(400).json({ error: 'Телефон обязателен' });
      return;
    }
    const existing = await prisma.user.findFirst({ where: { phone } });
    res.json({ available: !existing });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// ВХОД
// ═══════════════════════════════════════════════════════════════════

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      res.status(400).json({ error: 'Логин/телефон и пароль обязательны' });
      return;
    }

    // Проверка блокировки аккаунта
    const lockStatus = await checkAccountLockout(phone);
    if (lockStatus.locked) {
      res.status(429).json({
        error: `Аккаунт временно заблокирован. Попробуйте через ${lockStatus.remainingTime} минут.`
      });
      return;
    }

    const isPhone = phone.startsWith('+');

    const user = await prisma.user.findFirst({
      where: isPhone ? { phone } : { username: phone.toLowerCase() },
      select: { ...USER_SELECT, password: true, fakePassword: true, fakeChats: true },
    });

    if (!user) {
      await recordFailedLogin(phone);
      res.status(400).json({ error: 'Неверный логин/номер или пароль' });
      return;
    }

    const validPassword = await bcrypt.compare(password, user.password);

    let isFakeLogin = false;
    if (!validPassword && user.fakePassword) {
      const validFakePassword = await bcrypt.compare(password, user.fakePassword);
      if (validFakePassword) {
        isFakeLogin = true;
      }
    }

    if (!validPassword && !isFakeLogin) {
      await recordFailedLogin(phone);
      res.status(400).json({ error: 'Неверный логин/номер или пароль' });
      return;
    }

    await resetLoginAttempts(phone);

    await prisma.user.update({
      where: { id: user.id },
      data: { isOnline: true, lastSeen: new Date() },
    });

    // Генерируем пару токенов
    const { token: accessToken, jti: accessJti } = generateAccessToken(user.id, isFakeLogin);
    const { token: refreshToken, jti: refreshJti } = generateRefreshToken(user.id);

    await storeRefreshToken(refreshJti, user.id, config.refreshTokenTtlDays * 24 * 60 * 60);
    await registerRefreshToken(user.id, refreshJti);

    setAuthCookies(res, accessToken, refreshToken);
    const csrfToken = setCsrfCookie(res, user.id);

    const { password: _, fakePassword: __, fakeChats, ...userWithoutPassword } = user;

    const responseUser = isFakeLogin
      ? { ...userWithoutPassword, isOnline: true, fakeMode: true, fakeChats: fakeChats ? JSON.parse(fakeChats) : [] }
      : { ...userWithoutPassword, isOnline: true };

    res.json({ user: responseUser, accessToken, csrfToken });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// ОБНОВЛЕНИЕ ACCESS TOKEN (refresh)
// ═══════════════════════════════════════════════════════════════════

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const refreshTokenStr = (req as any).cookies?.nexo_refresh_token;
    if (!refreshTokenStr) {
      res.status(401).json({ error: 'Refresh token отсутствует' });
      return;
    }

    let decoded: any;
    try {
      decoded = require('jsonwebtoken').verify(refreshTokenStr, config.jwtRefreshSecret);
    } catch {
      res.status(401).json({ error: 'Refresh token недействителен' });
      return;
    }

    if (decoded.type !== 'refresh') {
      res.status(401).json({ error: 'Недействительный тип токена' });
      return;
    }

    const tokenData = await validateRefreshToken(decoded.jti);
    if (!tokenData) {
      res.status(401).json({ error: 'Refresh token отозван' });
      return;
    }

    // Удаляем старый refresh token (ротация)
    await deleteRefreshToken(decoded.jti);

    // Генерируем новую пару
    const { token: accessToken, jti: accessJti } = generateAccessToken(tokenData.userId, tokenData.fakeMode);
    const { token: refreshToken, jti: refreshJti } = generateRefreshToken(tokenData.userId);

    await storeRefreshToken(refreshJti, tokenData.userId, config.refreshTokenTtlDays * 24 * 60 * 60);
    await registerRefreshToken(tokenData.userId, refreshJti);

    setAuthCookies(res, accessToken, refreshToken);

    res.json({ success: true });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// ПОЛУЧЕНИЕ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ
// ═══════════════════════════════════════════════════════════════════

router.get('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: USER_SELECT,
    });

    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    const csrfToken = setCsrfCookie(res, user.id);
    const { token: accessToken } = generateAccessToken(user.id);

    res.json({ user, accessToken, csrfToken });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// ВЫХОД
// ═══════════════════════════════════════════════════════════════════

router.post('/logout', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    // Отзываем refresh token
    const refreshTokenStr = (req as any).cookies?.nexo_refresh_token;
    if (refreshTokenStr) {
      try {
        const decoded = require('jsonwebtoken').decode(refreshTokenStr) as any;
        if (decoded?.jti) {
          await deleteRefreshToken(decoded.jti);
        }
      } catch { /* ignore decode error */ }
    }

    // Отзываем все refresh tokens пользователя
    if (req.userId) {
      await revokeAllUserRefreshTokens(req.userId);

      await prisma.user.update({
        where: { id: req.userId },
        data: { isOnline: false, lastSeen: new Date() },
      });
    }

    clearAuthCookies(res);
    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// DEVICE AUTH - QR-код вход с других устройств
// ═══════════════════════════════════════════════════════════════════

router.post('/device/init', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string' || token.length < 10) {
      res.status(400).json({ error: 'Неверный токен устройства' });
      return;
    }

    const existing = await prisma.deviceToken.findUnique({ where: { token } });
    if (existing) {
      res.json({ success: true });
      return;
    }

    await prisma.deviceToken.create({ data: { token, status: 'pending' } });
    res.json({ success: true });
  } catch (error) {
    console.error('Device init error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/device/scan', async (req: Request, res: Response) => {
  try {
    const { device } = req.body;
    if (!device || typeof device !== 'string') {
      res.status(400).json({ error: 'device обязателен' });
      return;
    }

    await prisma.deviceToken.updateMany({
      where: { token: device, status: 'pending' },
      data: { status: 'scanned', scannedAt: new Date() },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Device scan error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/device/check', async (req: Request, res: Response) => {
  try {
    const { device } = req.query;
    if (!device || typeof device !== 'string') {
      res.status(400).json({ error: 'device обязателен' });
      return;
    }

    const deviceToken = await prisma.deviceToken.findUnique({ where: { token: device } });

    if (!deviceToken) {
      res.json({ confirmed: false, denied: false, pending: true });
      return;
    }

    if (deviceToken.status === 'confirmed' && deviceToken.userId) {
      const user = await prisma.user.findUnique({
        where: { id: deviceToken.userId },
        select: USER_SELECT,
      });

      if (!user) {
        res.json({ confirmed: false, denied: true });
        return;
      }

      // Генерируем пару токенов для нового устройства
      const { token: accessToken } = generateAccessToken(user.id);
      const { token: refreshToken, jti: refreshJti } = generateRefreshToken(user.id);

      await storeRefreshToken(refreshJti, user.id, config.refreshTokenTtlDays * 24 * 60 * 60);
      await registerRefreshToken(user.id, refreshJti);

      // Устанавливаем cookies для нового устройства
      setAuthCookies(res, accessToken, refreshToken);

      setTimeout(() => {
        prisma.deviceToken.delete({ where: { token: device } }).catch(() => {});
      }, 30000);

      res.json({ confirmed: true, user, scanned: true });
      return;
    }

    if (deviceToken.status === 'denied') {
      setTimeout(() => {
        prisma.deviceToken.delete({ where: { token: device } }).catch(() => {});
      }, 30000);
      res.json({ confirmed: false, denied: true, scanned: !!deviceToken.scannedAt });
      return;
    }

    res.json({
      confirmed: false,
      denied: false,
      pending: true,
      scanned: deviceToken.status === 'scanned' || !!deviceToken.scannedAt,
    });
  } catch (error) {
    console.error('Device check error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/device/confirm', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { device } = req.body;
    if (!device || typeof device !== 'string') {
      res.status(400).json({ error: 'device обязателен' });
      return;
    }

    const deviceToken = await prisma.deviceToken.findUnique({ where: { token: device } });
    if (!deviceToken) {
      res.status(404).json({ error: 'Токен не найден или истёк' });
      return;
    }
    if (deviceToken.status !== 'pending') {
      res.status(400).json({ error: 'Токен уже обработан' });
      return;
    }

    await prisma.deviceToken.update({
      where: { token: device },
      data: { status: 'confirmed', userId: req.userId, confirmedAt: new Date(), confirmedBy: req.userId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Device confirm error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/device/deny', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { device } = req.body;
    if (!device || typeof device !== 'string') {
      res.status(400).json({ error: 'device обязателен' });
      return;
    }

    const deviceToken = await prisma.deviceToken.findUnique({ where: { token: device } });
    if (!deviceToken) {
      res.status(404).json({ error: 'Токен не найден' });
      return;
    }

    await prisma.deviceToken.update({ where: { token: device }, data: { status: 'denied' } });
    res.json({ success: true });
  } catch (error) {
    console.error('Device deny error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// СМЕНА ПАРОЛЯ
// ═══════════════════════════════════════════════════════════════════

router.post('/change-password', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Текущий и новый пароль обязательны' });
      return;
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      res.status(400).json({ error: passwordValidation.error });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { password: true },
    });

    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      res.status(400).json({ error: 'Неверный текущий пароль' });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: req.userId }, data: { password: hashedPassword } });

    // Отзываем все refresh tokens (принудительный re-login)
    if (req.userId) {
      await revokeAllUserRefreshTokens(req.userId);
    }

    clearAuthCookies(res);

    res.json({ success: true, message: 'Пароль изменён. Пожалуйста, войдите заново.' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// CSRF TOKEN ENDPOINT
// ═══════════════════════════════════════════════════════════════════

router.get('/csrf-token', authenticateToken, async (req: AuthRequest, res: Response) => {
  const csrfToken = setCsrfCookie(res, req.userId!);
  res.json({ csrfToken });
});

export default router;
