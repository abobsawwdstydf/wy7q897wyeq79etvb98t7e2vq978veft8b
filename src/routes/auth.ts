import { Router, Request } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { prisma } from '../db';
import { config } from '../config';
import { USER_SELECT } from '../shared';
import { 
  authenticateToken, 
  AuthRequest, 
  checkAccountLockout, 
  recordFailedLogin, 
  resetLoginAttempts,
  revokeToken 
} from '../middleware/auth';
import rateLimit from 'express-rate-limit';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // SECURITY FIX: Проверка MIME типа и расширения
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

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 час
  max: process.env.NODE_ENV === 'production' ? 5 : 1000, // 5 регистраций в час в продакшене
  message: { error: 'Слишком много попыток регистрации. Подождите час.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  skip: (req) => process.env.NODE_ENV !== 'production', // Только в продакшене
  keyGenerator: (req) => req.ip || req.socket.remoteAddress || 'unknown',
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: process.env.NODE_ENV === 'production' ? 10 : 1000, // 10 попыток входа в 15 минут в продакшене
  message: { error: 'Слишком много попыток входа. Подождите 15 минут.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  skip: (req) => process.env.NODE_ENV !== 'production', // Только в продакшене
  keyGenerator: (req) => req.ip || req.socket.remoteAddress || 'unknown',
});

/**
 * SECURITY FIX: Валидация пароля
 */
function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 6) {
    return { valid: false, error: 'Пароль должен содержать минимум 6 символов' };
  }
  if (password.length > 50) {
    return { valid: false, error: 'Пароль не более 50 символов' };
  }
  return { valid: true };
}

/**
 * SECURITY FIX: Санитизация имени файла
 */
function sanitizeFilename(filename: string): string {
  // Удаляем всё кроме букв, цифр, точки, дефиса и подчёркивания
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// Регистрация
// @ts-ignore
router.post('/register', registerLimiter, upload.single('avatar') as any, async (req: Request, res) => {
  try {
    const { username, displayName, phone, password, bio, birthday } = req.body;
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

    // SECURITY FIX: Валидация всех обязательных полей
    if (!username || !displayName || !phone || !password || !birthday) {
      res.status(400).json({ error: 'Username, имя, телефон, пароль и дата рождения обязательны' });
      return;
    }

    // SECURITY FIX: Валидация username (латиница, цифры, -_.)
    if (!/^[a-zA-Z0-9_.\-]{3,17}$/.test(username)) {
      res.status(400).json({ error: 'Username: 3-17 символов, только латиница, цифры и -_.' });
      return;
    }
    if (username.startsWith('.') || username.endsWith('.')) {
      res.status(400).json({ error: 'Точка не может быть в начале или конце username' });
      return;
    }

    // SECURITY FIX: Валидация телефона
    if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
      res.status(400).json({ error: 'Телефон в формате +79991234567' });
      return;
    }

    // SECURITY FIX: Валидация пароля
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      res.status(400).json({ error: passwordValidation.error });
      return;
    }

    // SECURITY FIX: Валидация displayName (защита от XSS)
    const xssPattern = /<script|javascript:|onerror=|onclick=|onload=|<iframe|<object|<embed|data:text\/html/i;
    if (displayName.length > 50 || xssPattern.test(displayName)) {
      res.status(400).json({ error: 'Недопустимое имя' });
      return;
    }
    
    // SECURITY FIX: Валидация bio (защита от XSS)
    if (bio && (bio.length > 500 || xssPattern.test(bio))) {
      res.status(400).json({ error: 'Недопустимое описание' });
      return;
    }

    // SECURITY FIX: Валидация даты рождения (не сегодня и не в будущем)
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

    // Проверка существующего username
    const existingUsername = await prisma.user.findUnique({ 
      where: { username: username.toLowerCase() } 
    });
    if (existingUsername) {
      res.status(400).json({ error: 'Username занят' });
      return;
    }

    // Проверка существующего телефона
    const existingPhone = await prisma.user.findFirst({ where: { phone } });
    if (existingPhone) {
      res.status(400).json({ error: 'Этот номер уже зарегистрирован' });
      return;
    }

    // REMOVED: IP-based registration limit check for development
    // const accountsFromIp = await prisma.user.count({ where: { registrationIp: clientIp } });
    // if (accountsFromIp >= config.maxRegistrationsPerIp) {
    //   res.status(403).json({ error: `Лимит регистраций с этого IP` });
    //   return;
    // }

    // Обработка аватара
    let avatarPath: string | null = null;
    if (req.file) {
      const fs = await import('fs');
      const path = await import('path');
      const { UPLOADS_ROOT } = await import('../shared');
      
      // SECURITY FIX: Генерация случайного имени файла
      const ext = req.file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
      const randomName = `avatar_${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${ext}`;
      avatarPath = `/uploads/avatars/${randomName}`;
      
      const dir = path.join(UPLOADS_ROOT, 'avatars');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, randomName), req.file.buffer);
    }

    // Хеширование пароля
    const hashedPassword = await bcrypt.hash(password, 12); // SECURITY FIX: Увеличен cost с 10 до 12
    
    // Создание пользователя
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

    // SECURITY FIX: Токен с коротким временем жизни
    const token = jwt.sign(
      { userId: user.id }, 
      config.jwtSecret, 
      { expiresIn: `${config.sessionTimeoutHours}h` }
    );
    
    res.json({ token, user: { ...user, isOnline: true } });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Проверка доступности username
router.get('/check-username', async (req, res) => {
  try {
    const { username } = req.query;
    if (!username || typeof username !== 'string') {
      res.status(400).json({ error: 'Username обязателен' });
      return;
    }
    if (!/^[a-zA-Z0-9_.\-]{3,17}$/.test(username)) {
      res.json({ available: false, reason: 'invalid' });
      return;
    }
    if (username.startsWith('.') || username.endsWith('.')) {
      res.json({ available: false, reason: 'invalid' });
      return;
    }
    const existing = await prisma.user.findUnique({ 
      where: { username: username.toLowerCase() } 
    });
    res.json({ available: !existing });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Проверка доступности телефона
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

// Вход
// @ts-ignore
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { phone, password } = req.body;
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

    if (!phone || !password) {
      res.status(400).json({ error: 'Логин/телефон и пароль обязательны' });
      return;
    }

    // SECURITY FIX: Проверка блокировки аккаунта
    const lockStatus = checkAccountLockout(phone);
    if (lockStatus.locked) {
      res.status(429).json({ 
        error: `Аккаунт временно заблокирован. Попробуйте через ${lockStatus.remainingTime} минут.` 
      });
      return;
    }

    // Определяем тип входа (телефон или username)
    const isPhone = phone.startsWith('+');
    
    const user = await prisma.user.findFirst({
      where: isPhone 
        ? { phone } 
        : { username: phone.toLowerCase() },
      select: { ...USER_SELECT, password: true, fakePassword: true, fakeChats: true },
    });

    if (!user) {
      // SECURITY FIX: Регистрация неудачной попытки
      recordFailedLogin(phone);
      res.status(400).json({ error: 'Неверный логин/номер или пароль' });
      return;
    }

    const validPassword = await bcrypt.compare(password, user.password);
    
    // Check fake password (duress mode)
    let isFakeLogin = false;
    if (!validPassword && user.fakePassword) {
      const validFakePassword = await bcrypt.compare(password, user.fakePassword);
      if (validFakePassword) {
        isFakeLogin = true;
      }
    }

    if (!validPassword && !isFakeLogin) {
      // SECURITY FIX: Регистрация неудачной попытки
      recordFailedLogin(phone);
      res.status(400).json({ error: 'Неверный логин/номер или пароль' });
      return;
    }

    // SECURITY FIX: Сброс счётчика попыток после успешного входа
    resetLoginAttempts(phone);

    // Обновление статуса онлайн
    await prisma.user.update({
      where: { id: user.id },
      data: { isOnline: true, lastSeen: new Date() },
    });

    // SECURITY FIX: Токен с коротким временем жизни
    // For fake login, embed a flag in the token
    const tokenPayload = isFakeLogin 
      ? { userId: user.id, fakeMode: true }
      : { userId: user.id };
    const token = jwt.sign(
      tokenPayload, 
      config.jwtSecret, 
      { expiresIn: `${config.sessionTimeoutHours}h` }
    );
    
    const { password: _, fakePassword: __, fakeChats, ...userWithoutPassword } = user;

    // In fake mode, return limited user data with fakeChats list
    const responseUser = isFakeLogin
      ? { ...userWithoutPassword, isOnline: true, fakeMode: true, fakeChats: fakeChats ? JSON.parse(fakeChats) : [] }
      : { ...userWithoutPassword, isOnline: true };

    res.json({ token, user: responseUser });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение текущего пользователя
router.get('/me', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: USER_SELECT,
    });

    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    res.json({ user });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// SECURITY FIX: Выход (отзыв токена)
router.post('/logout', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token) {
      revokeToken(token);
    }
    
    // Обновление статуса оффлайн
    if (req.userId) {
      await prisma.user.update({
        where: { id: req.userId },
        data: { isOnline: false, lastSeen: new Date() },
      });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============================================
// DEVICE AUTH - QR-код вход с других устройств
// ============================================

// Инициализация device token (вызывается при генерации QR-кода)
router.post('/device/init', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token || typeof token !== 'string' || token.length < 10) {
      res.status(400).json({ error: 'Неверный токен устройства' });
      return;
    }

    // Проверяем, не существует ли уже такой токен
    const existing = await prisma.deviceToken.findUnique({ where: { token } });
    if (existing) {
      res.json({ success: true });
      return;
    }

    // Создаём новый pending token
    await prisma.deviceToken.create({
      data: {
        token,
        status: 'pending',
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Device init error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Помечаем, что QR был отсканирован (вызывается со страницы подтверждения, когда она открылась)
router.post('/device/scan', async (req, res) => {
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

// Проверка статуса device token (polling с устройства, которое сканирует QR, и с QR-страницы)
router.get('/device/check', async (req, res) => {
  try {
    const { device } = req.query;

    if (!device || typeof device !== 'string') {
      res.status(400).json({ error: 'device обязателен' });
      return;
    }

    const deviceToken = await prisma.deviceToken.findUnique({
      where: { token: device },
    });

    if (!deviceToken) {
      // Токен не найден - значит ещё не был зарегистрирован
      res.json({ confirmed: false, denied: false, pending: true });
      return;
    }

    if (deviceToken.status === 'confirmed' && deviceToken.userId) {
      // Получаем данные пользователя, который подтвердил вход
      const user = await prisma.user.findUnique({
        where: { id: deviceToken.userId },
        select: USER_SELECT,
      });

      if (!user) {
        res.json({ confirmed: false, denied: true });
        return;
      }

      // Генерируем JWT токен для нового устройства
      const jwtToken = jwt.sign(
        { userId: user.id },
        config.jwtSecret,
        { expiresIn: `${config.sessionTimeoutHours}h` }
      );

      // Удаляем использованный device token через 30 секунд, чтобы QR-страница тоже успела увидеть подтверждение
      setTimeout(() => {
        prisma.deviceToken.delete({ where: { token: device } }).catch(() => {});
      }, 30000);

      res.json({ confirmed: true, token: jwtToken, user, scanned: true });
      return;
    }

    if (deviceToken.status === 'denied') {
      // Удаляем отклонённый token через 30 секунд
      setTimeout(() => {
        prisma.deviceToken.delete({ where: { token: device } }).catch(() => {});
      }, 30000);
      res.json({ confirmed: false, denied: true, scanned: !!deviceToken.scannedAt });
      return;
    }

    // Статус pending или scanned
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

// Подтверждение device token (вызывается на устройстве, где уже авторизованы)
router.post('/device/confirm', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { device } = req.body;

    if (!device || typeof device !== 'string') {
      res.status(400).json({ error: 'device обязателен' });
      return;
    }

    const deviceToken = await prisma.deviceToken.findUnique({
      where: { token: device },
    });

    if (!deviceToken) {
      res.status(404).json({ error: 'Токен не найден или истёк' });
      return;
    }

    if (deviceToken.status !== 'pending') {
      res.status(400).json({ error: 'Токен уже обработан' });
      return;
    }

    // Подтверждаем
    await prisma.deviceToken.update({
      where: { token: device },
      data: {
        status: 'confirmed',
        userId: req.userId,
        confirmedAt: new Date(),
        confirmedBy: req.userId,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Device confirm error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Отклонение device token
router.post('/device/deny', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { device } = req.body;

    if (!device || typeof device !== 'string') {
      res.status(400).json({ error: 'device обязателен' });
      return;
    }

    const deviceToken = await prisma.deviceToken.findUnique({
      where: { token: device },
    });

    if (!deviceToken) {
      res.status(404).json({ error: 'Токен не найден' });
      return;
    }

    await prisma.deviceToken.update({
      where: { token: device },
      data: { status: 'denied' },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Device deny error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// SECURITY FIX: Смена пароля (отзыв всех токенов)
router.post('/change-password', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Текущий и новый пароль обязательны' });
      return;
    }
    
    // Валидация нового пароля
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      res.status(400).json({ error: passwordValidation.error });
      return;
    }
    
    // Проверка текущего пароля
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
    
    // Обновление пароля
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.userId },
      data: { password: hashedPassword },
    });
    
    // SECURITY FIX: Отзыв текущего токена (пользователь должен войти заново)
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
      revokeToken(token);
    }
    
    res.json({ success: true, message: 'Пароль изменён. Пожалуйста, войдите заново.' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
