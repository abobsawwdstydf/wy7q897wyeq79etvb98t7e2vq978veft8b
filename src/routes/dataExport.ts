import express from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();

// Экспорт всех данных пользователя
router.get('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, username: true, displayName: true, email: true,
        bio: true, createdAt: true, isVerified: true,
        profileMusic: true, musicPlaylists: true, musicTracks: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [messages, chatMembers, friendships, stories, bookmarks, callLogs, reactions, tasks, calendarEvents, messageTemplates, storiesViewed] = await Promise.all([
      prisma.message.findMany({
        where: { senderId: userId },
        select: {
          id: true, content: true, type: true, createdAt: true, chatId: true,
          isEdited: true, isDeleted: true, videoUrl: true, duration: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10000,
      }),
      prisma.chatMember.findMany({
        where: { userId },
        select: { chatId: true, role: true, joinedAt: true, isMuted: true },
      }),
      prisma.friendship.findMany({
        where: { OR: [{ userId }, { friendId: userId }] },
        select: { userId: true, friendId: true, status: true, createdAt: true },
      }),
      prisma.story.findMany({
        where: { userId },
        select: { id: true, type: true, content: true, createdAt: true, expiresAt: true, isHighlight: true },
      }),
      prisma.bookmark.findMany({
        where: { userId },
        select: { messageId: true, note: true, createdAt: true },
      }),
      prisma.callLog.findMany({
        where: { OR: [{ callerId: userId }, { calleeId: userId }] },
        select: { id: true, type: true, status: true, duration: true, createdAt: true },
      }),
      prisma.reaction.findMany({
        where: { userId },
        select: { messageId: true, emoji: true, createdAt: true },
      }),
      prisma.task.findMany({
        where: { OR: [{ creatorId: userId }, { assigneeId: userId }] },
        select: { id: true, title: true, status: true, priority: true, deadline: true, createdAt: true },
      }),
      prisma.calendarEvent.findMany({
        where: { creatorId: userId },
        select: { id: true, title: true, description: true, startAt: true, endAt: true, location: true },
      }),
      prisma.messageTemplate.findMany({
        where: { userId },
        select: { name: true, content: true, createdAt: true },
      }),
      prisma.storyView.findMany({
        where: { userId },
        select: { storyId: true, viewedAt: true },
      }),
    ]);

    const exportData = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      user,
      data: {
        messages,
        chatMemberships: chatMembers,
        friendships,
        stories,
        storiesViewed,
        bookmarks,
        callLogs,
        reactions,
        tasks,
        calendarEvents,
        messageTemplates,
      },
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="nexo-export-${user.username}-${new Date().toISOString().split('T')[0]}.json"`);
    res.json(exportData);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

// Экспорт только сообщений
router.get('/messages', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { chatId, limit = 10000 } = req.query;

    const where: any = { senderId: userId, isDeleted: false };
    if (chatId) where.chatId = chatId as string;

    const messages = await prisma.message.findMany({
      where,
      include: {
        sender: { select: { id: true, username: true, displayName: true } },
        chat: { select: { id: true, name: true, type: true } },
        media: true,
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="nexo-messages-${new Date().toISOString().split('T')[0]}.json"`);
    res.json({ messages, exportedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Export messages error:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

// Экспорт медиа
router.get('/media', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const userChats = await prisma.chatMember.findMany({
      where: { userId },
      select: { chatId: true },
    });
    const chatIds = userChats.map(c => c.chatId);

    const media = await prisma.media.findMany({
      where: {
        message: {
          chatId: { in: chatIds },
          senderId: userId,
        },
      },
      include: {
        message: {
          select: { id: true, createdAt: true, content: true },
        },
      },
      orderBy: { message: { createdAt: 'desc' } },
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="nexo-media-${new Date().toISOString().split('T')[0]}.json"`);
    res.json({ media, exportedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Export media error:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

export default router;
