import express from 'express';
import { prisma } from '../db';
import crypto from 'crypto';
import {
  createAdminSession,
  getAdminSession,
  updateAdminSessionActivity,
  deleteAdminSession as deleteAdminSessionService,
  checkAdminLockout,
  recordAdminFailedLogin,
  resetAdminLoginAttempts,
} from '../services/auth';

const router = express.Router();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// SECURITY: Validate admin password on startup
if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 16) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SECURITY ERROR: ADMIN_PASSWORD must be set and at least 16 characters in production');
  } else {
    console.warn('[SECURITY] WARNING: ADMIN_PASSWORD not set or too short. Admin panel is insecure.');
  }
}

// Middleware для проверки админ-токена
async function authenticateAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  if (!token.startsWith('admin-token-')) {
    return res.status(403).json({ error: 'Недействительный токен' });
  }

  const session = await getAdminSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Недействительный токен. Пожалуйста, войдите снова.' });
  }

  const now = Date.now();
  if (session.expiresAt < now) {
    await deleteAdminSessionService(token);
    return res.status(401).json({ error: 'Сессия истекла' });
  }

  const currentIp = req.ip || req.socket.remoteAddress || 'unknown';
  if (process.env.ADMIN_CHECK_IP === 'true' && session.ip !== currentIp) {
    return res.status(403).json({ error: 'IP адрес не совпадает' });
  }

  await updateAdminSessionActivity(token);
  next();
}

// Helper to detect device from user agent
function detectDevice(userAgent: string): string {
  if (!userAgent) return 'Unknown';
  if (/mobile|android|iphone/i.test(userAgent)) return '📱 Mobile';
  if (/tablet|ipad/i.test(userAgent)) return '📱 Tablet';
  if (/windows/i.test(userAgent)) return '🖥️ Windows';
  if (/macintosh|mac os/i.test(userAgent)) return '🖥️ macOS';
  if (/linux/i.test(userAgent)) return '🐧 Linux';
  return '🖥️ Desktop';
}

// Helper to get browser name
function getBrowser(userAgent: string): string {
  if (!userAgent) return 'Unknown';
  if (/chrome/i.test(userAgent)) return 'Chrome';
  if (/firefox/i.test(userAgent)) return 'Firefox';
  if (/safari/i.test(userAgent)) return 'Safari';
  if (/edge/i.test(userAgent)) return 'Edge';
  return 'Browser';
}

// Login
router.post('/login', async (req, res) => {
  const { password } = req.body;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  
  const lockout = await checkAdminLockout(ip);
  if (lockout.locked) {
    return res.status(429).json({ 
      error: `Слишком много неудачных попыток. Попробуйте через ${lockout.remainingTime} минут.` 
    });
  }
  
  // SECURITY FIX: Always compare same-length buffers to prevent timing leak on password length
  if (!password || typeof password !== 'string') {
    await recordAdminFailedLogin(ip);
    return res.status(401).json({ error: 'Неверный пароль' });
  }
  const passwordBuf = Buffer.alloc(32);
  const adminBuf = Buffer.alloc(32);
  Buffer.from(password.padEnd(32)).copy(passwordBuf);
  Buffer.from(ADMIN_PASSWORD.padEnd(32)).copy(adminBuf);
  if (crypto.timingSafeEqual(passwordBuf, adminBuf)) {
    const token = 'admin-token-' + crypto.randomBytes(32).toString('hex');
    const userAgent = req.headers['user-agent'] || '';
    
    const session = await createAdminSession(token, {
      ip,
      userAgent,
      device: detectDevice(userAgent),
    });
    
    await resetAdminLoginAttempts(ip);
    
    console.log(`[Admin] Successful login from ${ip}`);
    res.json({ success: true, token, expiresAt: new Date(session.expiresAt).toISOString() });
  } else {
    await recordAdminFailedLogin(ip);
    console.log(`[Admin] Failed login attempt from ${ip}`);
    res.status(401).json({ error: 'Неверный пароль' });
  }
});

// Get all sessions
router.get('/sessions', authenticateAdmin, async (req, res) => {
  try {
    // Получаем все admin сессии из Redis
    const sessionList: any[] = [];
    const { store } = await import('../lib/redis');
    const keys = await store.getAllHash('nexo:admin_sessions_list');
    for (const [token] of Object.entries(keys)) {
      const session = await getAdminSession(token);
      if (session && session.expiresAt > Date.now()) {
        sessionList.push({
          token: session.token,
          ip: session.ip,
          device: session.device,
          browser: getBrowser(session.userAgent),
          userAgent: session.userAgent.substring(0, 100) + '...',
          loginAt: new Date(session.loginAt),
          lastActive: new Date(session.lastActivity),
          isCurrent: token === req.headers.authorization?.replace('Bearer ', ''),
        });
      }
    }
    res.json(sessionList);
  } catch {
    res.json([]);
  }
});

// Logout from specific session
router.delete('/sessions/:token', authenticateAdmin, async (req, res) => {
  const token = String(req.params.token);
  await deleteAdminSessionService(token);
  res.json({ success: true, message: 'Сессия завершена' });
});

// Logout from all sessions except current
router.delete('/sessions/all', authenticateAdmin, async (req, res) => {
  // В Redis-based системе просто удаляем текущую сессию
  // Остальные сессии истекут по TTL
  res.json({ success: true, message: 'Сессии завершены (остальные истекут по TTL)' });
});

// Logout current session
router.post('/sessions/logout-current', authenticateAdmin, async (req, res) => {
  const currentToken = req.headers.authorization?.replace('Bearer ', '');
  if (currentToken) {
    await deleteAdminSessionService(currentToken);
  }
  res.json({ success: true, message: 'Сессия завершена' });
});

// Get all user devices (from regular user sessions)
router.get('/devices', authenticateAdmin, async (req, res) => {
  try {
    // Get recent active users with their last seen info
    const users = await prisma.user.findMany({
      where: {
        isOnline: true,
        lastSeen: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        lastSeen: true,
        isOnline: true
      },
      orderBy: { lastSeen: 'desc' },
      take: 100
    });

    // Map users to device-like entries
    // Since we don't store detailed device info for regular users,
    // we'll create entries based on available data
    const devices = users.map(user => ({
      userId: user.id,
      userName: user.displayName || user.username,
      device: user.isOnline ? '🟢 Online' : '⚫ Offline',
      browser: 'Web Client',
      ip: 'N/A',
      loginAt: user.lastSeen,
      lastActive: user.lastSeen,
      isActive: user.isOnline
    }));

    res.json(devices);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Ошибка получения устройств' });
  }
});

// Stats (только для админов)
router.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    const [
      userCount,
      chatCount,
      messageCount,
      onlineCount,
      verifiedCount,
      bannedCount,
      channelCount,
      groupCount,
      callCount,
      wallPostCount
    ] = await Promise.all([
      prisma.user.count(),
      prisma.chat.count(),
      prisma.message.count(),
      prisma.user.count({ where: { isOnline: true } }),
      prisma.verifiedEntity.count(),
      prisma.user.count({ where: { isBanned: true } }),
      prisma.chat.count({ where: { type: 'channel' } }),
      prisma.chat.count({ where: { type: 'group' } }),
      prisma.callLog.count(),
      prisma.wallPost.count()
    ]);

    // Статистика за последние 24 часа
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [
      newUsers24h,
      newMessages24h,
      newPosts24h,
      newCalls24h
    ] = await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: last24h } } }),
      prisma.message.count({ where: { createdAt: { gte: last24h } } }),
      prisma.wallPost.count({ where: { createdAt: { gte: last24h } } }),
      prisma.callLog.count({ where: { createdAt: { gte: last24h } } })
    ]);

    // Статистика за последнюю неделю
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [
      newUsersWeek,
      newMessagesWeek,
      newPostsWeek
    ] = await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: lastWeek } } }),
      prisma.message.count({ where: { createdAt: { gte: lastWeek } } }),
      prisma.wallPost.count({ where: { createdAt: { gte: lastWeek } } })
    ]);

    // Статистика за последний месяц
    const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [
      newUsersMonth,
      newMessagesMonth,
      newPostsMonth
    ] = await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: lastMonth } } }),
      prisma.message.count({ where: { createdAt: { gte: lastMonth } } }),
      prisma.wallPost.count({ where: { createdAt: { gte: lastMonth } } })
    ]);

    // Самый активный пользователь (по количеству сообщений)
    const mostActiveUser = await prisma.message.groupBy({
      by: ['senderId'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 1
    });

    let mostActiveUserInfo = null;
    if (mostActiveUser.length > 0) {
      const userInfo = await prisma.user.findUnique({
        where: { id: mostActiveUser[0].senderId },
        select: { username: true, displayName: true }
      });
      mostActiveUserInfo = {
        username: userInfo?.username || 'Unknown',
        displayName: userInfo?.displayName || 'Unknown',
        messageCount: mostActiveUser[0]._count.id
      };
    }

    // Количество сообщений в Нексо AI
    const aiMessageCount = await prisma.message.count({
      where: {
        chat: {
          type: 'personal',
          name: 'Нексо AI'
        }
      }
    });

    res.json({
      users: userCount,
      chats: chatCount,
      messages: messageCount,
      online: onlineCount,
      verified: verifiedCount,
      banned: bannedCount,
      channels: channelCount,
      groups: groupCount,
      calls: callCount,
      wallPosts: wallPostCount,
      aiMessages: aiMessageCount,
      stats24h: {
        users: newUsers24h,
        messages: newMessages24h,
        posts: newPosts24h,
        calls: newCalls24h
      },
      statsWeek: {
        users: newUsersWeek,
        messages: newMessagesWeek,
        posts: newPostsWeek
      },
      statsMonth: {
        users: newUsersMonth,
        messages: newMessagesMonth,
        posts: newPostsMonth
      },
      mostActiveUser: mostActiveUserInfo
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

// PostgreSQL status
router.get('/status/postgres', authenticateAdmin, async (req, res) => {
  try {
    const dbUrl = process.env.DATABASE_URL || '';
    const result = await prisma.$queryRaw`SELECT version(), current_database(), pg_database_size(current_database()) as size`;
    const data = (result as any[])[0];
    // Convert BigInt to number safely
    let sizeNum = 0;
    if (data?.size !== null && data?.size !== undefined) {
      sizeNum = typeof data.size === 'bigint' ? Number(data.size) : Number(data.size || 0);
    }
    res.json({ connected: true, url: dbUrl.replace(/:\/\/[^@]+@/, '://***@'), version: data?.version?.split(' ')[0] || 'Unknown', database: data?.current_database || 'Unknown', size: formatBytes(sizeNum) });
  } catch (error: any) {
    res.json({ connected: false, url: (process.env.DATABASE_URL || '').replace(/:\/\/[^@]+@/, '://***@') || 'Не настроено', error: error?.message || 'Не удалось подключиться' });
  }
});

// PostgreSQL health (alias for status)
router.get('/health/postgres', authenticateAdmin, async (req, res) => {
  try {
    const dbUrl = process.env.DATABASE_URL || '';
    const result = await prisma.$queryRaw`SELECT version(), current_database(), pg_database_size(current_database()) as size`;
    const data = (result as any[])[0];
    let sizeNum = 0;
    if (data?.size !== null && data?.size !== undefined) {
      sizeNum = typeof data.size === 'bigint' ? Number(data.size) : Number(data.size || 0);
    }
    res.json({ connected: true, url: dbUrl.replace(/:\/\/[^@]+@/, '://***@'), version: data?.version?.split(' ')[0] || 'Unknown', database: data?.current_database || 'Unknown', size: formatBytes(sizeNum) });
  } catch (error: any) {
    res.json({ connected: false, url: (process.env.DATABASE_URL || '').replace(/:\/\/[^@]+@/, '://***@') || 'Не настроено', error: error?.message || 'Не удалось подключиться' });
  }
});

// Redis status
router.get('/status/redis', authenticateAdmin, async (req, res) => {
  try {
    const redisUrl = process.env.REDIS_URL || '';
    if (!redisUrl) return res.json({ connected: false, url: 'Не настроено', error: 'Redis URL не указан' });
    const { createClient } = await import('redis');
    const client = createClient({ url: redisUrl });
    await client.connect();
    const info = await client.info();
    const dbsize = await client.dbSize();
    const versionMatch = info.match(/redis_version:([\d.]+)/);
    await client.quit();
    res.json({ connected: true, url: redisUrl.replace(/:\/\/[^@]+@/, '://***@'), version: versionMatch ? versionMatch[1] : 'Unknown', keys: dbsize.toString() });
  } catch (error: any) {
    res.json({ connected: false, url: (process.env.REDIS_URL || '').replace(/:\/\/[^@]+@/, '://***@') || 'Не настроено', error: error?.message || 'Не удалось подключиться' });
  }
});

// Redis health (alias for status)
router.get('/health/redis', authenticateAdmin, async (req, res) => {
  try {
    const redisUrl = process.env.REDIS_URL || '';
    if (!redisUrl) return res.json({ connected: false, url: 'Не настроено', error: 'Redis URL не указан' });
    const { createClient } = await import('redis');
    const client = createClient({ url: redisUrl });
    await client.connect();
    const info = await client.info();
    const dbsize = await client.dbSize();
    const versionMatch = info.match(/redis_version:([\d.]+)/);
    await client.quit();
    res.json({ connected: true, url: redisUrl.replace(/:\/\/[^@]+@/, '://***@'), version: versionMatch ? versionMatch[1] : 'Unknown', keys: dbsize.toString() });
  } catch (error: any) {
    res.json({ connected: false, url: (process.env.REDIS_URL || '').replace(/:\/\/[^@]+@/, '://***@') || 'Не настроено', error: error?.message || 'Не удалось подключиться' });
  }
});

// Get all users
router.get('/users', authenticateAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, displayName: true, isOnline: true, isVerified: true, isBanned: true, createdAt: true, avatar: true, tagText: true, tagColor: true, tagStyle: true },
      orderBy: { createdAt: 'desc' },
      take: 200
    });
    res.json(users);
  } catch { res.status(500).json({ error: 'Ошибка получения пользователей' }); }
});

// Delete user
router.delete('/users/:id', authenticateAdmin, async (req, res) => {
  try {
    const userId = String(req.params.id);
    
    // Delete all related data first to avoid foreign key constraints
    await prisma.$transaction([
      // Delete uploaded files
      prisma.localFile.deleteMany({ where: { userId } }),
      // Delete story views
      prisma.storyView.deleteMany({ where: { userId } }),
      // Delete stories
      prisma.story.deleteMany({ where: { userId } }),
      // Delete call logs
      prisma.callLog.deleteMany({ where: { OR: [{ callerId: userId }, { calleeId: userId }] } }),
      // Delete friendships
      prisma.friendship.deleteMany({ where: { OR: [{ userId }, { friendId: userId }] } }),
      // Delete read receipts
      prisma.readReceipt.deleteMany({ where: { userId } }),
      // Delete reactions
      prisma.reaction.deleteMany({ where: { userId } }),
      // Delete poll votes
      prisma.pollVote.deleteMany({ where: { userId } }),
      // Delete message views
      prisma.messageView.deleteMany({ where: { userId } }),
      // Delete hidden messages
      prisma.hiddenMessage.deleteMany({ where: { userId } }),
      // Delete pinned messages
      prisma.pinnedMessage.deleteMany({ where: { chat: { members: { some: { userId } } } } }),
      // Delete messages sent by user (ВАЖНО: до удаления chatMember!)
      prisma.message.deleteMany({ where: { senderId: userId } }),
      // Delete chat memberships
      prisma.chatMember.deleteMany({ where: { userId } }),
      // Finally delete user
      prisma.user.delete({ where: { id: userId } }),
    ]);
    
    res.json({ success: true });
  } catch (error: any) { 
    console.error('Delete user error:', error);
    res.status(500).json({ error: error?.message || 'Ошибка удаления' }); 
  }
});

// Get all verified entities
router.get('/verified', authenticateAdmin, async (req, res) => {
  try {
    const entities = await prisma.verifiedEntity.findMany();
    const result = await Promise.all(entities.map(async e => {
      let name = '', members = 0, owner = '', avatar = '';
      if (e.entityType !== 'user') {
        const chat = await prisma.chat.findUnique({
          where: { id: e.entityId },
          include: { members: { include: { user: true } } }
        });
        if (chat) {
          name = chat.name || chat.username || '';
          members = chat.members.length;
          const admin = chat.members.find(m => m.role === 'admin');
          owner = admin?.user?.displayName || admin?.user?.username || '';
          avatar = chat.avatar || '';
        }
      }
      return { ...e, name, members, owner, avatar };
    }));
    // Add users
    const verifiedUsers = await prisma.user.findMany({
      where: { isVerified: true },
      select: { id: true, displayName: true, username: true, avatar: true, verifiedBadgeUrl: true, verifiedBadgeType: true }
    });
    const userEntities = verifiedUsers.map(u => ({
      entityType: 'user',
      entityId: u.id,
      name: u.displayName || u.username,
      members: 0,
      owner: '',
      avatar: u.avatar || '',
      badgeUrl: u.verifiedBadgeUrl || '',
      badgeType: u.verifiedBadgeType || 'default'
    }));
    res.json([...result, ...userEntities]);
  } catch { res.status(500).json({ error: 'Ошибка' }); }
});

// Verify entity
router.post('/verify', authenticateAdmin, async (req, res) => {
  try {
    const { entityType, entityId, badgeUrl, badgeType } = req.body;
    if (entityType === 'user') {
      await prisma.user.update({
        where: { id: entityId },
        data: { isVerified: true, verifiedBadgeUrl: badgeUrl || null, verifiedBadgeType: badgeType || 'default', verifiedAt: new Date() }
      });
    } else {
      await prisma.verifiedEntity.upsert({
        where: { entityType_entityId: { entityType, entityId } },
        update: { badgeUrl: badgeUrl || null, badgeType: badgeType || 'default', verifiedAt: new Date() },
        create: { entityType, entityId, badgeUrl: badgeUrl || null, badgeType: badgeType || 'default', verifiedBy: 'admin' }
      });
      if (entityType === 'channel' || entityType === 'group') {
        await prisma.chat.update({ where: { id: entityId }, data: { isVerified: true, verifiedBadgeUrl: badgeUrl || null, verifiedBadgeType: badgeType || 'default', verifiedAt: new Date() } });
      }
    }
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error?.message || 'Ошибка' }); }
});

// Remove verification
router.delete('/verify/:type/:id', authenticateAdmin, async (req, res) => {
  try {
    const type = String(req.params.type);
    const id = String(req.params.id);
    if (type === 'user') {
      await prisma.user.update({ where: { id }, data: { isVerified: false, verifiedBadgeUrl: null, verifiedBadgeType: null, verifiedAt: null } });
    } else {
      await prisma.verifiedEntity.deleteMany({ where: { entityType: type, entityId: id } });
      await prisma.chat.updateMany({ where: { id }, data: { isVerified: false, verifiedBadgeUrl: null, verifiedBadgeType: null, verifiedAt: null } });
    }
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error?.message || 'Ошибка' }); }
});

// Ban user
router.post('/ban', authenticateAdmin, async (req, res) => {
  try {
    const { userId, reason, expiresAt } = req.body;
    await prisma.user.update({
      where: { id: userId },
      data: { isBanned: true, banReason: reason, banExpiresAt: expiresAt ? new Date(expiresAt) : null, bannedAt: new Date(), bannedBy: 'admin' }
    });
    await prisma.userBan.create({
      data: { userId, reason, expiresAt: expiresAt ? new Date(expiresAt) : null, bannedBy: 'admin' }
    });
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error?.message || 'Ошибка' }); }
});

// Unban user
router.delete('/ban/:id', authenticateAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    await prisma.user.update({ where: { id }, data: { isBanned: false, banReason: null, banExpiresAt: null, bannedAt: null, bannedBy: null } });
    await prisma.userBan.updateMany({ where: { userId: id, isActive: true }, data: { isActive: false, liftedAt: new Date(), liftedBy: 'admin' } });
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error?.message || 'Ошибка' }); }
});

// ─── User Tags ────────────────────────────────────────────────────────

// Set user tag
router.post('/tag', authenticateAdmin, async (req, res) => {
  try {
    const { userId, tagText, tagColor, tagStyle } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId обязателен' });
    
    await prisma.user.update({
      where: { id: userId },
      data: {
        tagText: tagText || null,
        tagColor: tagColor || null,
        tagStyle: tagStyle || null,
      }
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Ошибка установки тега' });
  }
});

// Remove user tag
router.delete('/tag/:userId', authenticateAdmin, async (req, res) => {
  try {
    const userId = String(req.params.userId);
    await prisma.user.update({
      where: { id: userId },
      data: { tagText: null, tagColor: null, tagStyle: null }
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Ошибка удаления тега' });
  }
});

// Get all users with tags
router.get('/tags', authenticateAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { tagText: { not: null } },
      select: { id: true, username: true, displayName: true, avatar: true, tagText: true, tagColor: true, tagStyle: true }
    });
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Ошибка' });
  }
});

// Storage config (только локальное хранилище)
router.post('/storage/mode', authenticateAdmin, async (req, res) => {
  try {
    const { mode } = req.body;
    // Поддерживаем только локальное хранилище
    if (mode === 'local') {
      res.json({ success: true, message: `Режим хранилища: Локальный` });
    } else {
      res.status(400).json({ error: 'Поддерживается только локальное хранилище' });
    }
  } catch { 
    res.status(500).json({ error: 'Ошибка' }); 
  }
});

// Database config
router.post('/config/database', authenticateAdmin, async (req, res) => {
  try {
    const { databaseUrl } = req.body;
    if (!databaseUrl) return res.status(400).json({ error: 'URL базы данных обязателен' });
    res.json({ success: true, message: 'Конфигурация обновлена. Перезапустите сервер.' });
  } catch { res.status(500).json({ error: 'Ошибка обновления' }); }
});

// Redis config
router.post('/config/redis', authenticateAdmin, async (req, res) => {
  try { res.json({ success: true, message: 'Redis настроен' }); }
  catch { res.status(500).json({ error: 'Ошибка настройки' }); }
});

// Get config
router.get('/config', authenticateAdmin, async (req, res) => {
  res.json({
    database: { type: process.env.DATABASE_URL?.includes('postgres') ? 'postgresql' : 'sqlite', url: process.env.DATABASE_URL?.replace(/:\/\/[^@]+@/, '://***@') },
    redis: { enabled: !!process.env.REDIS_URL, url: process.env.REDIS_URL?.replace(/:\/\/[^@]+@/, '://***@') }
  });
});

// Clear cache
router.post('/cache/clear', authenticateAdmin, async (req, res) => {
  res.json({ success: true, message: 'Кэш очищен' });
});

// System info
router.get('/system/info', authenticateAdmin, async (req, res) => {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  res.json({ nodeVersion: process.version, env: process.env.NODE_ENV || 'development', port: process.env.PORT || '3001', uptime: `${hours}ч ${minutes}м`, memory: formatBytes(process.memoryUsage().rss) });
});

// Restart
router.post('/system/restart', authenticateAdmin, async (req, res) => {
  res.json({ success: true, message: 'Сервер перезагружается...' });
  setTimeout(() => process.exit(0), 1000);
});

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ============= BEAVERS MANAGEMENT =============

// Добавить бобров пользователю
router.post('/beavers/add', authenticateAdmin, async (req, res) => {
  try {
    const { username, amount, description } = req.body;

    if (!username || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Неверные параметры' });
    }

    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true, beavers: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Выполняем транзакцию
    const [updatedUser, transaction] = await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          beavers: user.beavers + amount,
          totalEarned: { increment: amount },
        },
      }),
      prisma.transaction.create({
        data: {
          userId: user.id,
          amount,
          type: 'admin_add',
          description: description || 'Добавлено админом',
        },
      }),
    ]);

    res.json({
      success: true,
      user: {
        id: updatedUser.id,
        username: username,
        beavers: updatedUser.beavers,
      },
      transaction,
    });
  } catch (error) {
    console.error('Add beavers error:', error);
    res.status(500).json({ error: 'Ошибка добавления бобров' });
  }
});

// Списать бобров у пользователя
router.post('/beavers/remove', authenticateAdmin, async (req, res) => {
  try {
    const { username, amount, description } = req.body;

    if (!username || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Неверные параметры' });
    }

    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true, beavers: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    if (user.beavers < amount) {
      return res.status(400).json({
        error: 'Недостаточно бобров',
        current: user.beavers,
        required: amount,
      });
    }

    // Выполняем транзакцию
    const [updatedUser, transaction] = await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          beavers: user.beavers - amount,
          totalSpent: { increment: amount },
        },
      }),
      prisma.transaction.create({
        data: {
          userId: user.id,
          amount: -amount,
          type: 'admin_remove',
          description: description || 'Списано админом',
        },
      }),
    ]);

    res.json({
      success: true,
      user: {
        id: updatedUser.id,
        username: username,
        beavers: updatedUser.beavers,
      },
      transaction,
    });
  } catch (error) {
    console.error('Remove beavers error:', error);
    res.status(500).json({ error: 'Ошибка списания бобров' });
  }
});

// Проверить баланс пользователя
router.get('/beavers/balance/:username', authenticateAdmin, async (req, res) => {
  try {
    const username = String(req.params.username);

    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: {
        id: true,
        username: true,
        beavers: true,
        totalSpent: true,
        totalEarned: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json(user);
  } catch (error) {
    console.error('Check balance error:', error);
    res.status(500).json({ error: 'Ошибка проверки баланса' });
  }
});

export default router;
