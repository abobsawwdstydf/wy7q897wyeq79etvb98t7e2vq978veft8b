import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';
import { USER_SELECT, SENDER_SELECT, uploadGroupAvatar, deleteUploadedFile, encryptUploadedFile } from '../shared';
import { sanitizeText, CONTENT_LIMITS } from '../lib/sanitize';

const router = Router();

// Compact user select for chat member lists (no bio/birthday)
const CHAT_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
  isOnline: true,
  lastSeen: true,
  isVerified: true,
  verifiedBadgeUrl: true,
  verifiedBadgeType: true,
  tagText: true,
  tagColor: true,
  tagStyle: true,
};

// Получить все чаты пользователя
router.get('/', async (req: AuthRequest, res) => {
  try {
    const chats = await prisma.chat.findMany({
      where: {
        members: { some: { userId: req.userId } },
      },
      include: {
        members: {
          include: { user: { select: CHAT_USER_SELECT } },
        },
        messages: {
          where: {
            isDeleted: false,
            OR: [
              { scheduledAt: null },
              { senderId: req.userId! },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, username: true, displayName: true } },
            readBy: { select: { userId: true } },
          },
        },
        pinnedMessages: {
          orderBy: { pinnedAt: 'desc' },
          take: 1,
          include: {
            message: {
              include: {
                sender: { select: SENDER_SELECT },
                media: true,
              },
            },
          },
        },
      },
    });

    // Batch unread counts in a single query to avoid N+1
    const chatIds = chats.map(c => c.id);
    let unreadCounts: Array<{ chatId: string; count: bigint }> = [];
    if (chatIds.length > 0) {
      unreadCounts = await prisma.$queryRaw<Array<{ chatId: string; count: bigint }>>(
        Prisma.sql`SELECT m."chatId", COUNT(m.id) as count FROM "Message" m
         LEFT JOIN "ReadReceipt" rr ON rr."messageId" = m.id AND rr."userId" = ${req.userId}
         WHERE m."chatId" IN (${Prisma.join(chatIds)})
         AND m."senderId" != ${req.userId} AND m."isDeleted" = false AND rr.id IS NULL
         AND m."scheduledAt" IS NULL
         GROUP BY m."chatId"`
      ).catch(() => [] as Array<{ chatId: string; count: bigint }>);
    }

    const unreadMap = new Map(unreadCounts.map(r => [r.chatId, Number(r.count)]));

    // Filter last message by clearedAt per user
    const chatsFiltered = chats.map((chat) => {
      const member = chat.members.find((m) => m.userId === req.userId);
      const clearedAt = member?.clearedAt;
      if (clearedAt && chat.messages.length > 0) {
        const filtered = chat.messages.filter((msg) => new Date(msg.createdAt) > new Date(clearedAt));
        return { ...chat, messages: filtered };
      }
      return chat;
    });

    const sortedChats = chatsFiltered.sort((a, b) => {
      const aPinned = a.members.find((m) => m.userId === req.userId)?.isPinned || false;
      const bPinned = b.members.find((m) => m.userId === req.userId)?.isPinned || false;
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      const aDate = a.messages[0]?.createdAt || a.createdAt;
      const bDate = b.messages[0]?.createdAt || b.createdAt;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });

    const chatsWithUnread = sortedChats.map((chat) => ({
      ...chat,
      unreadCount: unreadMap.get(chat.id) || 0,
    }));

    res.json(chatsWithUnread);
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать личный чат
router.post('/personal', async (req: AuthRequest, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      res.status(400).json({ error: 'ID пользователя обязателен' });
      return;
    }

    const existingChat = await prisma.chat.findFirst({
      where: {
        type: 'personal',
        AND: [
          { members: { some: { userId: req.userId } } },
          { members: { some: { userId } } },
        ],
      },
      include: {
        members: { include: { user: { select: CHAT_USER_SELECT } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, username: true, displayName: true } },
            readBy: { select: { userId: true } },
          },
        },
      },
    });

    if (existingChat) {
      res.json({ ...existingChat, unreadCount: 0 });
      return;
    }

    const chat = await prisma.chat.create({
      data: {
        type: 'personal',
        members: {
          create: [{ userId: req.userId! }, { userId }],
        },
      },
      include: {
        members: { include: { user: { select: CHAT_USER_SELECT } } },
        messages: true,
      },
    });

    res.json({ ...chat, unreadCount: 0 });
  } catch (error) {
    console.error('Create chat error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать или получить чат "Избранное" (saved messages)
router.post('/favorites', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Check if favorites chat already exists
    const existing = await prisma.chat.findFirst({
      where: {
        type: 'favorites',
        members: { some: { userId } },
      },
      include: {
        members: { include: { user: { select: CHAT_USER_SELECT } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, username: true, displayName: true } },
            readBy: { select: { userId: true } },
          },
        },
      },
    });

    if (existing) {
      res.json({ ...existing, unreadCount: 0 });
      return;
    }

    // Check if user exists first
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const chat = await prisma.chat.create({
      data: {
        type: 'favorites',
        name: null,
        members: {
          create: [{ userId, role: 'admin' }],
        },
      },
      include: {
        members: { include: { user: { select: CHAT_USER_SELECT } } },
        messages: true,
      },
    });

    res.json({ ...chat, unreadCount: 0 });
  } catch (error) {
    console.error('Create favorites chat error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать групповой чат
router.post('/group', async (req: AuthRequest, res) => {
  try {
    const { name, memberIds } = req.body;
    if (!name || !memberIds || !Array.isArray(memberIds)) {
      res.status(400).json({ error: 'Название и участники обязательны' });
      return;
    }

    // SECURITY: Sanitize and validate group name
    const sanitizedName = sanitizeText(name);
    if (sanitizedName.length === 0 || sanitizedName.length > CONTENT_LIMITS.CHAT_GROUP_NAME) {
      res.status(400).json({ error: 'Название группы должно быть от 1 до 100 символов' });
      return;
    }

    // Limit max members
    if (memberIds.length > 256) {
      res.status(400).json({ error: 'Максимум 256 участников в группе' });
      return;
    }

    const allMemberIds = [...new Set([req.userId!, ...memberIds])];

    const chat = await prisma.chat.create({
      data: {
        type: 'group',
        name: sanitizedName,
        members: {
          create: allMemberIds.map((uid) => ({
            userId: uid,
            role: uid === req.userId ? 'admin' : 'member',
          })),
        },
      },
      include: {
        members: { include: { user: { select: CHAT_USER_SELECT } } },
        messages: true,
      },
    });

    res.json({ ...chat, unreadCount: 0 });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать канал
router.post('/channel', async (req: AuthRequest, res) => {
  try {
    const { name, username, description, avatar } = req.body;
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Название канала обязательно' });
      return;
    }

    // SECURITY: Sanitize and validate channel name
    const sanitizedName = sanitizeText(name);
    if (sanitizedName.length === 0 || sanitizedName.length > CONTENT_LIMITS.CHAT_GROUP_NAME) {
      res.status(400).json({ error: 'Название канала должно быть от 1 до 100 символов' });
      return;
    }

    // SECURITY: Sanitize description
    const sanitizedDescription = description ? sanitizeText(description) : null;

    // Username is required
    if (!username || typeof username !== 'string') {
      res.status(400).json({ error: 'Юзернейм канала обязателен' });
      return;
    }

    // Validate username
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
      res.status(400).json({ error: 'Юзернейм должен быть от 3 до 32 символов, только латиница, цифры и _' });
      return;
    }

    // Check if username is already taken
    const existing = await prisma.chat.findUnique({ where: { username } });
    if (existing) {
      res.status(400).json({ error: 'Этот юзернейм уже занят' });
      return;
    }

    const chat = await prisma.chat.create({
      data: {
        type: 'channel',
        name: sanitizedName,
        username,
        description: sanitizedDescription,
        avatar: avatar || null,
        members: {
          create: {
            userId: req.userId!,
            role: 'admin',
          },
        },
      },
      include: {
        members: { include: { user: { select: CHAT_USER_SELECT } } },
        messages: true,
      },
    });

    res.json({ ...chat, unreadCount: 0 });
  } catch (error) {
    console.error('Create channel error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить чат по ID
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const chat = await prisma.chat.findFirst({
      where: {
        id: String(req.params.id),
        members: { some: { userId: req.userId } },
      },
      include: {
        members: { include: { user: { select: CHAT_USER_SELECT } } },
      },
    });

    if (!chat) {
      res.status(404).json({ error: 'Чат не найден' });
      return;
    }

    res.json(chat);
  } catch (_error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить канал по username (для вступления по ссылке)
router.get('/join/:username', async (req: AuthRequest, res) => {
  try {
    const username = String(req.params.username);
    
    const channel = await prisma.chat.findFirst({
      where: {
        type: 'channel',
        username: username as string,
      },
      include: {
        members: { include: { user: { select: CHAT_USER_SELECT } } },
      },
    });

    if (!channel) {
      res.status(404).json({ error: 'Канал не найден' });
      return;
    }

    // Check if user is already a member
    const existingMember = channel.members.find((m) => m.userId === req.userId);
    
    if (!existingMember) {
      // Auto-join the channel
      await prisma.chatMember.create({
        data: {
          chatId: channel.id,
          userId: req.userId!,
          role: 'member',
        },
      });
      
      // Reload channel with updated members
      const updatedChannel = await prisma.chat.findUnique({
        where: { id: channel.id },
        include: {
          members: { include: { user: { select: CHAT_USER_SELECT } } },
        },
      });
      
      res.json({ ...updatedChannel!, joined: true });
    } else {
      res.json({ ...channel, joined: false });
    }
  } catch (error) {
    console.error('Join channel error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Вступить в канал по username (POST запрос для совместимости)
router.post('/join/:username', async (req: AuthRequest, res) => {
  try {
    const username = String(req.params.username);
    
    const channel = await prisma.chat.findFirst({
      where: {
        type: 'channel',
        username: username as string,
      },
      include: {
        members: { include: { user: { select: CHAT_USER_SELECT } } },
      },
    });

    if (!channel) {
      res.status(404).json({ error: 'Канал не найден' });
      return;
    }

    // Check if user is already a member
    const existingMember = channel.members.find((m) => m.userId === req.userId);
    
    if (!existingMember) {
      // Auto-join the channel
      await prisma.chatMember.create({
        data: {
          chatId: channel.id,
          userId: req.userId!,
          role: 'member',
        },
      });
      
      // Reload channel with updated members
      const updatedChannel = await prisma.chat.findUnique({
        where: { id: channel.id },
        include: {
          members: { include: { user: { select: CHAT_USER_SELECT } } },
        },
      });
      
      res.json({ ...updatedChannel!, joined: true });
    } else {
      res.json({ ...channel, joined: false });
    }
  } catch (error) {
    console.error('Join channel error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновить группу/канал (только админ/модератор)
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.id);
    const { name, description, slowModeInterval, welcomeMessage, rules, canMembersPost, canMembersInvite } = req.body;

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member || !['admin', 'moderator'].includes(member.role)) {
      res.status(403).json({ error: 'Только администратор или модератор может редактировать' });
      return;
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = sanitizeText(name);
    if (description !== undefined) updateData.description = description ? sanitizeText(description) : null;
    if (slowModeInterval !== undefined) updateData.slowModeInterval = slowModeInterval;
    if (welcomeMessage !== undefined) updateData.welcomeMessage = welcomeMessage ? sanitizeText(welcomeMessage) : null;
    if (rules !== undefined) updateData.rules = rules ? sanitizeText(rules) : null;
    if (canMembersPost !== undefined) updateData.canMembersPost = canMembersPost;
    if (canMembersInvite !== undefined) updateData.canMembersInvite = canMembersInvite;
    
    // Stage 3: Channel customization
    if (req.body.customIcon !== undefined) updateData.customIcon = req.body.customIcon;
    if (req.body.customColor !== undefined) updateData.customColor = req.body.customColor;
    if (req.body.customBackground !== undefined) updateData.customBackground = req.body.customBackground;

    const chat = await prisma.chat.update({
      where: { id: chatId },
      data: updateData,
      include: {
        members: { include: { user: { select: USER_SELECT } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, username: true, displayName: true } },
            readBy: { select: { userId: true } },
          },
        },
      },
    });

    res.json(chat);
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Загрузить аватар группы (только админ)
router.post('/:id/avatar', uploadGroupAvatar.single('avatar') as any, encryptUploadedFile as any, async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.id);

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member || member.role !== 'admin') {
      res.status(403).json({ error: 'Только администратор может менять аватар группы' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'Файл не загружен' });
      return;
    }

    // Delete old avatar file
    const currentChat = await prisma.chat.findUnique({ where: { id: chatId }, select: { avatar: true } });
    if (currentChat?.avatar) deleteUploadedFile(currentChat.avatar);

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    const chat = await prisma.chat.update({
      where: { id: chatId },
      data: { avatar: avatarUrl },
      include: {
        members: { include: { user: { select: USER_SELECT } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, username: true, displayName: true } },
            readBy: { select: { userId: true } },
          },
        },
      },
    });

    res.json(chat);
  } catch (error) {
    console.error('Upload group avatar error:', error);
    res.status(500).json({ error: 'Ошибка загрузки аватара' });
  }
});

// Удалить аватар группы (только админ)
router.delete('/:id/avatar', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.id);

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member || member.role !== 'admin') {
      res.status(403).json({ error: 'Только администратор может менять аватар группы' });
      return;
    }

    // Delete file from disk
    const currentChat = await prisma.chat.findUnique({ where: { id: chatId }, select: { avatar: true } });
    if (currentChat?.avatar) deleteUploadedFile(currentChat.avatar);

    const chat = await prisma.chat.update({
      where: { id: chatId },
      data: { avatar: null },
      include: {
        members: { include: { user: { select: USER_SELECT } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, username: true, displayName: true } },
            readBy: { select: { userId: true } },
          },
        },
      },
    });

    res.json(chat);
  } catch (_error) {
    res.status(500).json({ error: 'Ошибка удаления аватара' });
  }
});

// Добавить участников в группу (только админ или если разрешено участникам)
router.post('/:id/members', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.id);
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({ error: 'Необходимо указать пользователей' });
      return;
    }

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    const chat = await prisma.chat.findUnique({ where: { id: chatId } });
    if (!chat || chat.type !== 'group') {
      res.status(400).json({ error: 'Чат не является группой' });
      return;
    }

    // Check permissions
    const isAdmin = member?.role === 'admin';
    const canInvite = member?.canInvite || false;
    
    if (!isAdmin && (!chat.canMembersInvite || !canInvite)) {
      res.status(403).json({ error: 'Нет прав для добавления участников' });
      return;
    }

    for (const uid of userIds) {
      const newMember = await prisma.chatMember.upsert({
        where: { chatId_userId: { chatId, userId: uid } },
        create: { chatId, userId: uid, role: 'member' },
        update: {},
      });
      
      // Send welcome message if configured
      if (chat.welcomeMessage && newMember) {
        await prisma.message.create({
          data: {
            chatId,
            senderId: req.userId!,
            content: chat.welcomeMessage,
            type: 'system',
          },
        });
      }
    }

    const updatedChat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        members: { include: { user: { select: USER_SELECT } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, username: true, displayName: true } },
            readBy: { select: { userId: true } },
          },
        },
      },
    });

    res.json(updatedChat);
  } catch (error) {
    console.error('Add members error:', error);
    res.status(500).json({ error: 'Ошибка добавления участников' });
  }
});

// Удалить участника из группы (только админ/модератор)
router.delete('/:id/members/:userId', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.id);
    const targetUserId = String(req.params.userId);

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member || !['admin', 'moderator'].includes(member.role)) {
      res.status(403).json({ error: 'Только администратор или модератор может удалять участников' });
      return;
    }

    if (targetUserId === req.userId) {
      res.status(400).json({ error: 'Нельзя удалить себя из группы' });
      return;
    }

    await prisma.chatMember.delete({
      where: { chatId_userId: { chatId, userId: targetUserId } },
    });

    const updatedChat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        members: { include: { user: { select: USER_SELECT } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, username: true, displayName: true } },
            readBy: { select: { userId: true } },
          },
        },
      },
    });

    res.json(updatedChat);
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Ошибка удаления участника' });
  }
});

// Очистить чат для себя
router.post('/:id/clear', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.id);

    await prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId: req.userId! } },
      data: { clearedAt: new Date() },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Clear chat error:', error);
    res.status(500).json({ error: 'Ошибка очистки чата' });
  }
});

// Получить аналитику канала (должен идти перед другими /:id роутами)
router.get('/:id/analytics', async (req: AuthRequest, res) => {
  try {
    const channelId = String(req.params.id);
    const userId = req.userId!;
    
    // Check if user is channel owner/admin
    const member = await prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId: channelId,
          userId,
        },
      },
    });
    
    if (!member || member.role !== 'admin') {
      res.status(403).json({ error: 'Только администратор может просматривать аналитику' });
      return;
    }
    
    // Get subscriber count
    const subscribers = await prisma.chatMember.count({
      where: { chatId: channelId },
    });
    
    // Get total posts
    const posts = await prisma.message.count({
      where: {
        chatId: channelId,
        isDeleted: false,
      },
    });
    
    // Get recent posts with stats
    const recentPosts = await prisma.message.findMany({
      where: {
        chatId: channelId,
        isDeleted: false,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        _count: {
          select: {
            views: true,
            reactions: true,
          },
        },
      },
    });
    
    // Get top posts by views
    const topPosts = await prisma.message.findMany({
      where: {
        chatId: channelId,
        isDeleted: false,
      },
      orderBy: { views: { _count: 'desc' } },
      take: 10,
      include: {
        _count: {
          select: {
            views: true,
            reactions: true,
          },
        },
      },
    });
    
    // Calculate total views
    const totalViewsResult = await prisma.messageView.groupBy({
      by: ['messageId'],
      where: {
        message: {
          chatId: channelId,
        },
      },
      _count: true,
    });
    
    const totalViews = totalViewsResult.reduce((sum, item) => sum + item._count, 0);

    // Get subscriber growth data (last 7 days by default)
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const growthData = await prisma.chatMember.groupBy({
      by: ['joinedAt'],
      where: {
        chatId: channelId,
        joinedAt: { gte: sevenDaysAgo },
      },
      _count: true,
    });

    // Group by day
    const growthByDay: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      growthByDay[dateStr] = 0;
    }
    
    growthData.forEach(item => {
      const dateStr = item.joinedAt.toISOString().split('T')[0];
      if (growthByDay[dateStr] !== undefined) {
        growthByDay[dateStr] += item._count;
      }
    });

    const growthArray = Object.entries(growthByDay).map(([date, count]) => ({ date, count }));

    res.json({
      subscribers,
      totalViews,
      posts,
      growthData: growthArray,
      recentPosts: recentPosts.map(p => ({
        id: p.id,
        content: p.content,
        createdAt: p.createdAt.toISOString(),
        viewCount: p._count.views,
        reactions: p._count.reactions,
      })),
      topPosts: topPosts.map(p => ({
        id: p.id,
        content: p.content,
        createdAt: p.createdAt.toISOString(),
        viewCount: p._count.views,
        reactions: p._count.reactions,
      })),
    });
  } catch (error) {
    console.error('Get channel analytics error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить чат (для текущего пользователя — выйти из чата)
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.id);
    const userId = req.userId!;

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { members: true },
    });

    if (!chat) {
      res.status(404).json({ error: 'Чат не найден' });
      return;
    }

    // Membership check
    const isMember = chat.members.some(m => m.userId === userId);
    if (!isMember) {
      res.status(403).json({ error: 'Нет доступа к этому чату' });
      return;
    }

    if (chat.type === 'channel') {
      // For channels: only admin can delete, and it deletes for everyone
      const isAdmin = chat.members.some(m => m.userId === userId && m.role === 'admin');
      if (!isAdmin) {
        // Regular members can just leave
        await prisma.chatMember.delete({
          where: { chatId_userId: { chatId, userId } },
        });
      } else {
        // Admin deletes - remove entire channel with all messages and members
        await prisma.chat.delete({ where: { id: chatId } });
      }
    } else if (chat.type === 'personal') {
      // For personal chats, just remove the member (soft leave) instead of destroying for both
      await prisma.chatMember.delete({
        where: { chatId_userId: { chatId, userId } },
      });
      // If both members have left, clean up the chat
      const remaining = await prisma.chatMember.count({ where: { chatId } });
      if (remaining === 0) {
        await prisma.chat.delete({ where: { id: chatId } });
      }
    } else if (chat.members.length <= 1) {
      // Last member — delete the group entirely
      await prisma.chat.delete({ where: { id: chatId } });
    } else {
      // For groups, just remove the member
      await prisma.chatMember.delete({
        where: { chatId_userId: { chatId, userId } },
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete chat error:', error);
    res.status(500).json({ error: 'Ошибка удаления чата' });
  }
});

// Закрепить / открепить чат
router.post('/:id/pin', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.id);
    const userId = req.userId!;

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });

    if (!member) {
      res.status(404).json({ error: 'Чат не найден' });
      return;
    }

    await prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: { isPinned: !member.isPinned },
    });

    res.json({ isPinned: !member.isPinned });
  } catch (error) {
    console.error('Pin chat error:', error);
    res.status(500).json({ error: 'Ошибка закрепления чата' });
  }
});

// Изменить роль участника (только админ)
router.put('/:id/members/:userId/role', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.id);
    const targetUserId = String(req.params.userId);
    const { role } = req.body;

    if (!['member', 'moderator', 'admin', 'guest'].includes(role)) {
      res.status(400).json({ error: 'Недопустимая роль' });
      return;
    }

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member || member.role !== 'admin') {
      res.status(403).json({ error: 'Только администратор может изменять роли' });
      return;
    }

    await prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId: targetUserId } },
      data: { role },
    });

    const updatedChat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        members: { include: { user: { select: USER_SELECT } } },
      },
    });

    res.json(updatedChat);
  } catch (error) {
    console.error('Change role error:', error);
    res.status(500).json({ error: 'Ошибка изменения роли' });
  }
});

// Изменить права участника (только админ)
router.put('/:id/members/:userId/permissions', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.id);
    const targetUserId = String(req.params.userId);
    const { canPost, canInvite, canPin, canDelete } = req.body;

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member || member.role !== 'admin') {
      res.status(403).json({ error: 'Только администратор может изменять права' });
      return;
    }

    const updateData: any = {};
    if (canPost !== undefined) updateData.canPost = canPost;
    if (canInvite !== undefined) updateData.canInvite = canInvite;
    if (canPin !== undefined) updateData.canPin = canPin;
    if (canDelete !== undefined) updateData.canDelete = canDelete;

    await prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId: targetUserId } },
      data: updateData,
    });

    const updatedChat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        members: { include: { user: { select: USER_SELECT } } },
      },
    });

    res.json(updatedChat);
  } catch (error) {
    console.error('Change permissions error:', error);
    res.status(500).json({ error: 'Ошибка изменения прав' });
  }
});

// Создать опрос в чате
router.post('/:id/polls', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.id);
    const { question, options, multipleChoice = false, anonymous = false } = req.body;

    if (!question || !options || !Array.isArray(options) || options.length < 2) {
      res.status(400).json({ error: 'Вопрос и минимум 2 варианта обязательны' });
      return;
    }

    if (options.length > 10) {
      res.status(400).json({ error: 'Максимум 10 вариантов ответа' });
      return;
    }

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member) {
      res.status(403).json({ error: 'Нет доступа к этому чату' });
      return;
    }

    const chat = await prisma.chat.findUnique({ where: { id: chatId } });
    
    // Check if user can post
    if (chat?.type === 'channel' && !chat.canMembersPost && member.role === 'member') {
      res.status(403).json({ error: 'Только администраторы могут публиковать в этом канале' });
      return;
    }

    // Check slow mode
    if (chat?.slowModeInterval && chat.slowModeInterval > 0 && member.lastMessageAt) {
      const timeSinceLastMessage = Date.now() - member.lastMessageAt.getTime();
      if (timeSinceLastMessage < chat.slowModeInterval * 1000) {
        const waitTime = Math.ceil((chat.slowModeInterval * 1000 - timeSinceLastMessage) / 1000);
        res.status(429).json({ error: `Медленный режим. Подождите ${waitTime} сек.` });
        return;
      }
    }

    const pollData = {
      question,
      options,
      multipleChoice,
      anonymous,
      votes: {},
    };

    const message = await prisma.message.create({
      data: {
        chatId,
        senderId: req.userId!,
        content: JSON.stringify(pollData),
        type: 'poll',
      },
      include: {
        sender: { select: { id: true, username: true, displayName: true, avatar: true } },
        media: true,
        reactions: true,
      },
    });

    // Update last message time for slow mode
    if (chat?.slowModeInterval && chat.slowModeInterval > 0) {
      await prisma.chatMember.update({
        where: { chatId_userId: { chatId, userId: req.userId! } },
        data: { lastMessageAt: new Date() },
      });
    }

    res.json(message);
  } catch (error) {
    console.error('Create poll error:', error);
    res.status(500).json({ error: 'Ошибка создания опроса' });
  }
});

// Голосовать в опросе
router.post('/polls/:messageId/vote', async (req: AuthRequest, res) => {
  try {
    const messageId = String(req.params.messageId);
    const { optionIndex } = req.body;

    if (typeof optionIndex !== 'number' || optionIndex < 0) {
      res.status(400).json({ error: 'Недопустимый индекс варианта' });
      return;
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message || message.type !== 'poll') {
      res.status(404).json({ error: 'Опрос не найден' });
      return;
    }

    const pollData = JSON.parse(message.content || '{}');

    if (optionIndex >= pollData.options.length) {
      res.status(400).json({ error: 'Недопустимый индекс варианта' });
      return;
    }

    // Check if user is member of the chat
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: message.chatId, userId: req.userId! } },
    });

    if (!member) {
      res.status(403).json({ error: 'Нет доступа к этому чату' });
      return;
    }

    // If not multiple choice, remove previous votes
    if (!pollData.multipleChoice) {
      await prisma.pollVote.deleteMany({
        where: { userId: req.userId!, option: { poll: { messageId } } },
      });
    }

    // Add new vote
    // The new schema uses optionId + userId, but the old API passes optionIndex.
    // Look up the option by index to get its id.
    const pollWithOptions = await prisma.poll.findUnique({
      where: { messageId },
      include: { options: { orderBy: { id: 'asc' } } },
    });
    if (!pollWithOptions) {
      res.status(404).json({ error: 'Опрос не найден' });
      return;
    }
    const option = pollWithOptions.options[optionIndex];
    if (!option) {
      res.status(400).json({ error: 'Недопустимый индекс варианта' });
      return;
    }

    await prisma.pollVote.upsert({
      where: { optionId_userId: { optionId: option.id, userId: req.userId! } },
      create: { optionId: option.id, userId: req.userId! },
      update: {},
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Vote poll error:', error);
    res.status(500).json({ error: 'Ошибка голосования' });
  }
});

export default router;
