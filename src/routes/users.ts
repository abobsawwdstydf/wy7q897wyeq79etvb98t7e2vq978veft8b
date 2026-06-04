import { Router } from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';
import { USER_SELECT, SENDER_SELECT, uploadUserAvatar, deleteUploadedFile, encryptUploadedFile } from '../shared';

const router = Router();

// Поиск пользователей
router.get('/search', async (req: AuthRequest, res) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string' || q.trim().length < 3) {
      res.json([]);
      return;
    }

    const searchQuery = q.trim().toLowerCase();

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: searchQuery } },
          { displayName: { contains: searchQuery } },
        ],
        NOT: { id: req.userId },
        isBanned: false, // Exclude banned users from search
      },
      select: USER_SELECT,
      take: 20,
      orderBy: [
        { isVerified: 'desc' }, // Verified users first
        { username: 'asc' },
      ],
    });

    res.json(users);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Поиск каналов по username
router.get('/channels/search', async (req: AuthRequest, res) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string' || q.trim().length < 3) {
      res.json([]);
      return;
    }

    const searchQuery = q.trim().toLowerCase();

    const channels = await prisma.chat.findMany({
      where: {
        type: 'channel',
        OR: [
          { username: { contains: searchQuery } },
          { name: { contains: searchQuery } },
        ],
      },
      include: {
        members: {
          include: { user: { select: { id: true, username: true, displayName: true, avatar: true } } },
        },
      },
      take: 20,
      orderBy: [
        { isVerified: 'desc' }, // Verified channels first
        { name: 'asc' },
      ],
    });

    res.json(channels);
  } catch (error) {
    console.error('Search channels error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Поиск групп
router.get('/groups/search', async (req: AuthRequest, res) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string' || q.trim().length < 3) {
      res.json([]);
      return;
    }

    const searchQuery = q.trim().toLowerCase();

    const groups = await prisma.chat.findMany({
      where: {
        type: 'group',
        OR: [
          { username: { contains: searchQuery } },
          { name: { contains: searchQuery } },
        ],
      },
      include: {
        members: {
          include: { user: { select: { id: true, username: true, displayName: true, avatar: true } } },
        },
      },
      take: 20,
      orderBy: [
        { isVerified: 'desc' }, // Verified groups first
        { name: 'asc' },
      ],
    });

    res.json(groups);
  } catch (error) {
    console.error('Search groups error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить настройки уведомлений (должен быть ДО /:id)
router.get('/notifications', async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Требуется авторизация' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        notifyAll: true,
        notifyMessages: true,
        notifyCalls: true,
        notifyFriends: true
      }
    });

    res.json(user || {
      notifyAll: true,
      notifyMessages: true,
      notifyCalls: true,
      notifyFriends: true
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to get notification settings' });
  }
});

// Обновить настройки уведомлений
router.put('/notifications', async (req: AuthRequest, res) => {
  try {
    const { notifyAll, notifyMessages, notifyCalls, notifyFriends } = req.body;

    const updateData: any = {};
    if (notifyAll !== undefined) updateData.notifyAll = notifyAll;
    if (notifyMessages !== undefined) updateData.notifyMessages = notifyMessages;
    if (notifyCalls !== undefined) updateData.notifyCalls = notifyCalls;
    if (notifyFriends !== undefined) updateData.notifyFriends = notifyFriends;

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: updateData,
      select: USER_SELECT
    });

    res.json(user);
  } catch (error) {
    console.error('Update notifications error:', error);
    res.status(500).json({ error: 'Failed to update notification settings' });
  }
});

// Получить настройки пользователя (включая синхронизацию)
router.get('/settings', async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        defaultChatBackground: true,
        settingsSyncEnabled: true,
        hideStoryViews: true,
        profileMusic: true, // Добавляем для рингтона
      }
    });

    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    // Парсим profileMusic для получения рингтона
    let ringtone = null;
    try {
      const musicArray = JSON.parse(user.profileMusic || '[]');
      ringtone = musicArray.find((m: any) => m.isRingtone) || null;
    } catch (e) {
      // Ignore parse errors
    }

    res.json({
      defaultChatBackground: user.defaultChatBackground,
      settingsSyncEnabled: user.settingsSyncEnabled,
      hideStoryViews: user.hideStoryViews,
      ringtone,
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Ошибка получения настроек' });
  }
});

// Обновить настройки пользователя (включая синхронизацию)
router.put('/settings', async (req: AuthRequest, res) => {
  try {
    const { hideStoryViews, defaultChatBackground, settingsSyncEnabled, ringtone } = req.body;

    const updateData: Record<string, any> = {};
    if (typeof hideStoryViews === 'boolean') updateData.hideStoryViews = hideStoryViews;
    if (defaultChatBackground !== undefined) updateData.defaultChatBackground = defaultChatBackground;
    if (typeof settingsSyncEnabled === 'boolean') updateData.settingsSyncEnabled = settingsSyncEnabled;

    // Обновляем рингтон в profileMusic
    if (ringtone !== undefined) {
      const currentUser = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { profileMusic: true },
      });

      let musicArray = [];
      try {
        musicArray = JSON.parse(currentUser?.profileMusic || '[]');
      } catch (e) {
        // Ignore parse errors
      }

      // Удаляем старый рингтон
      musicArray = musicArray.filter((m: any) => !m.isRingtone);

      // Добавляем новый рингтон если есть
      if (ringtone) {
        musicArray.push({ ...ringtone, isRingtone: true });
      }

      updateData.profileMusic = JSON.stringify(musicArray);
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: updateData,
      select: USER_SELECT,
    });

    res.json(user);
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Ошибка сохранения настроек' });
  }
});

// Профиль пользователя
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: String(req.params.id) },
      select: USER_SELECT,
    });

    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Загрузить аватар
router.post('/avatar', uploadUserAvatar.single('avatar') as any, encryptUploadedFile as any, async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Файл не загружен' });
      return;
    }

    // Delete old avatar file if exists
    const currentUser = await prisma.user.findUnique({ where: { id: req.userId }, select: { avatar: true } });
    if (currentUser?.avatar) deleteUploadedFile(currentUser.avatar);

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { avatar: avatarUrl },
      select: USER_SELECT,
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка загрузки аватара' });
  }
});

// Удалить аватар
router.delete('/avatar', async (req: AuthRequest, res) => {
  try {
    // Delete file from disk
    const currentUser = await prisma.user.findUnique({ where: { id: req.userId }, select: { avatar: true } });
    if (currentUser?.avatar) deleteUploadedFile(currentUser.avatar);

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { avatar: null },
      select: USER_SELECT,
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка удаления аватара' });
  }
});

// Обновить профиль (username можно менять!)
router.put('/profile', async (req: AuthRequest, res) => {
  try {
    const { displayName, bio, birthday, username } = req.body;

    // Validate field lengths
    if (displayName !== undefined && (typeof displayName !== 'string' || displayName.length === 0 || displayName.length > 50)) {
      res.status(400).json({ error: 'Имя должно быть от 1 до 50 символов' });
      return;
    }
    if (bio !== undefined && bio !== null && (typeof bio !== 'string' || bio.length > 500)) {
      res.status(400).json({ error: 'Био должно быть не длиннее 500 символов' });
      return;
    }
    if (birthday !== undefined && birthday !== null) {
      if (typeof birthday !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthday) || isNaN(Date.parse(birthday))) {
        res.status(400).json({ error: 'Некорректный формат даты рождения (YYYY-MM-DD)' });
        return;
      }
    }

    // Validate username if provided
    if (username !== undefined) {
      if (!username || typeof username !== 'string') {
        res.status(400).json({ error: 'Username обязателен' });
        return;
      }
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
        res.status(400).json({ error: 'Username: 3-20 символов, только латиница, цифры, _' });
        return;
      }
      // Check if username is already taken by another user
      const existing = await prisma.user.findFirst({
        where: {
          username: username.toLowerCase(),
          NOT: { id: req.userId },
        },
      });
      if (existing) {
        res.status(400).json({ error: 'Этот username уже занят' });
        return;
      }
    }

    const updateData: Record<string, string | null> = {};
    if (displayName !== undefined) updateData.displayName = displayName;
    if (bio !== undefined) updateData.bio = bio;
    if (birthday !== undefined) updateData.birthday = birthday;
    if (username !== undefined) updateData.username = username.toLowerCase();

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: updateData,
      select: USER_SELECT,
    });

    res.json(user);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Поиск сообщений
router.get('/messages/search', async (req: AuthRequest, res) => {
  try {
    const { q, chatId } = req.query;
    if (!q || typeof q !== 'string') {
      res.json([]);
      return;
    }

    const where: Record<string, unknown> = {
      content: { contains: q },
      isDeleted: false,
    };

    if (chatId) {
      where.chatId = chatId;
      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId: chatId as string, userId: req.userId! } },
      });
      if (member?.clearedAt) {
        where.createdAt = { gt: member.clearedAt };
      }
    } else {
      where.chat = {
        members: { some: { userId: req.userId } },
      };
    }

    const messages = await prisma.message.findMany({
      where,
      include: {
        sender: { select: SENDER_SELECT },
        chat: {
          select: {
            id: true,
            name: true,
            type: true,
            members: {
              include: {
                user: { select: { id: true, username: true, displayName: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // For global search (no chatId filter), filter out messages before clearedAt per chat
    let filtered = messages;
    if (!chatId) {
      const memberships = await prisma.chatMember.findMany({
        where: { userId: req.userId! },
        select: { chatId: true, clearedAt: true },
      });
      const clearedMap = new Map<string, Date>();
      for (const m of memberships) {
        if (m.clearedAt) clearedMap.set(m.chatId, m.clearedAt);
      }
      if (clearedMap.size > 0) {
        filtered = messages.filter((msg) => {
          const cleared = clearedMap.get(msg.chatId);
          if (!cleared) return true;
          return new Date(msg.createdAt) > new Date(cleared);
        });
      }
    }

    res.json(filtered);
  } catch (error) {
    console.error('Search messages error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Сохранить Web Push subscription
router.post('/push-subscription', async (req: AuthRequest, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription) {
      res.status(400).json({ error: 'Subscription required' });
      return;
    }

    // Check if user exists first
    const user = await prisma.user.findUnique({
      where: { id: req.userId }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Save to database
    await prisma.user.update({
      where: { id: req.userId },
      data: {
        pushSubscription: JSON.stringify(subscription)
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Save push subscription error:', error);
    res.status(500).json({ error: 'Failed to save push subscription' });
  }
});

// Прикрепить канал к профилю
router.put('/pin-channel', async (req: AuthRequest, res) => {
  try {
    const { channelId } = req.body;

    // Validate channel ownership
    const channel = await prisma.chat.findFirst({
      where: {
        id: channelId,
        type: 'channel',
        members: {
          some: {
            userId: req.userId,
            role: 'admin'
          }
        }
      }
    });

    if (!channel) {
      res.status(403).json({ error: 'Вы не являетесь владельцем этого канала' });
      return;
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { pinnedChannelId: channelId },
      select: USER_SELECT
    });

    res.json(user);
  } catch (error) {
    console.error('Pin channel error:', error);
    res.status(500).json({ error: 'Ошибка прикрепления канала' });
  }
});

// Открепить канал от профиля
router.delete('/pin-channel', async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { pinnedChannelId: null },
      select: USER_SELECT
    });

    res.json(user);
  } catch (error) {
    console.error('Unpin channel error:', error);
    res.status(500).json({ error: 'Ошибка открепления канала' });
  }
});

// Получить каналы пользователя
router.get('/:id/channels', async (req: AuthRequest, res) => {
  try {
    const targetUserId = String(req.params.id);

    const channels = await prisma.chat.findMany({
      where: {
        type: 'channel',
        members: {
          some: {
            userId: targetUserId,
            role: 'admin'
          }
        }
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, username: true, displayName: true, avatar: true } }
          }
        }
      }
    });

    res.json(channels);
  } catch (error) {
    console.error('Get channels error:', error);
    res.status(500).json({ error: 'Ошибка получения каналов' });
  }
});

// �������� ���������� ������������
router.get('/devices', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const headerDeviceId = req.headers['x-device-id'];
    const currentDeviceId = Array.isArray(headerDeviceId) ? headerDeviceId[0] : headerDeviceId;

    const devices = await prisma.userDevice.findMany({
      where: { userId },
      orderBy: { lastActive: 'desc' },
    });

    res.json(
      devices.map((d) => ({
        id: d.id,
        deviceId: d.deviceId,
        deviceName: d.deviceName,
        deviceType: d.deviceType,
        platform: d.platform,
        ip: d.ipAddress,
        userAgent: d.userAgent,
        lastActive: d.lastActive,
        addedAt: d.createdAt,
        isCurrent: Boolean(currentDeviceId) && d.deviceId === currentDeviceId,
      })),
    );
  } catch (error) {
    console.error('Get devices error:', error);
    res.status(500).json({ error: '������ ��������� ���������' });
  }
});

// ��������� ������ ����������
router.delete('/devices/:deviceId', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const deviceId = String(req.params.deviceId);

    const device = await prisma.userDevice.findUnique({ where: { deviceId } });
    if (!device || device.userId !== userId) {
      return res.status(404).json({ error: '���������� �� �������' });
    }

    await prisma.userDevice.delete({ where: { deviceId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Terminate device error:', error);
    res.status(500).json({ error: '������ ���������� ������' });
  }
});

// ��������� ��� ������ ����� �������
router.post('/devices/terminate-all', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const headerDeviceId = req.headers['x-device-id'];
    const currentDeviceId = Array.isArray(headerDeviceId) ? headerDeviceId[0] : headerDeviceId;

    const result = await prisma.userDevice.deleteMany({
      where: {
        userId,
        ...(currentDeviceId ? { NOT: { deviceId: currentDeviceId } } : {}),
      },
    });

    res.json({ success: true, count: result.count });
  } catch (error) {
    console.error('Terminate all devices error:', error);
    res.status(500).json({ error: '������ ���������� ������' });
  }
});

// ============= БАЛАНС БОБРОВ =============

// Получить баланс бобров
router.get('/balance', async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        beavers: true,
        totalSpent: true,
        totalEarned: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    res.json(user);
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ error: 'Ошибка получения баланса' });
  }
});

// Получить историю транзакций
router.get('/transactions', async (req: AuthRequest, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const transactions = await prisma.transaction.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset),
    });

    const total = await prisma.transaction.count({
      where: { userId: req.userId },
    });

    res.json({
      transactions,
      total,
      limit: Number(limit),
      offset: Number(offset),
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Ошибка получения транзакций' });
  }
});

export default router;
