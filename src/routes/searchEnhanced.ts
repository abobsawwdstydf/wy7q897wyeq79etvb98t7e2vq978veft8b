import { Router } from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Full-text search across messages using SQLite FTS-like approach
router.get('/fulltext', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { q, type, senderId, chatId, dateFrom, dateTo, hasMedia, limit = '50', offset = '0' } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return res.status(400).json({ error: 'Поисковый запрос обязателен' });
    }

    const userChats = await prisma.chatMember.findMany({
      where: { userId },
      select: { chatId: true }
    });
    const chatIds = userChats.map(c => c.chatId);

    const searchTerms = q.trim().split(/\s+/).filter(t => t.length > 0);

    const where: any = {
      chatId: { in: chatIds },
      isDeleted: false,
      OR: searchTerms.flatMap((term: string) => [
        { content: { contains: term } },
        { quote: { contains: term } },
      ]),
    };

    if (type && typeof type === 'string') where.type = type;
    if (senderId && typeof senderId === 'string') where.senderId = senderId;
    if (chatId && typeof chatId === 'string') where.chatId = chatId;
    if (hasMedia === 'true') where.media = { some: {} };
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom as string);
      if (dateTo) where.createdAt.lte = new Date(dateTo as string);
    }

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        include: {
          sender: { select: { id: true, username: true, displayName: true, avatar: true } },
          chat: { select: { id: true, type: true, name: true, avatar: true } },
          media: true,
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Number(limit), 100),
        skip: Number(offset),
      }),
      prisma.message.count({ where }),
    ]);

    // Highlight search terms in results
    const highlighted = messages.map(msg => {
      let highlightedContent = msg.content || '';
      for (const term of searchTerms) {
        const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        highlightedContent = highlightedContent.replace(regex, '«$1»');
      }
      return { ...msg, highlightedContent };
    });

    res.json({ messages: highlighted, total, limit: Number(limit), offset: Number(offset) });
  } catch (error) {
    console.error('Fulltext search error:', error);
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

// Search users
router.get('/users', async (req: AuthRequest, res) => {
  try {
    const { q, limit = '20' } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'query обязателен' });
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: q } },
          { displayName: { contains: q } },
        ],
        isBanned: false,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
        bio: true,
        isPremium: true,
        isVerified: true,
      },
      take: Math.min(Number(limit), 50),
    });

    res.json(users);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

// Search chats
router.get('/chats', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { q, limit = '20' } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'query обязателен' });
    }

    const memberChats = await prisma.chatMember.findMany({
      where: { userId },
      select: { chatId: true }
    });
    const chatIds = memberChats.map(c => c.chatId);

    const chats = await prisma.chat.findMany({
      where: {
        id: { in: chatIds },
        OR: [
          { name: { contains: q } },
          { username: { contains: q } },
        ],
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, username: true, displayName: true, avatar: true } }
          }
        }
      },
      take: Math.min(Number(limit), 50),
    });

    res.json(chats);
  } catch (error) {
    console.error('Search chats error:', error);
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

// ─── ENHANCED SEARCH ──────────────────────────────────────────────────

// Search by reactions
router.get('/reactions', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { emoji, chatId, limit = '50', offset = '0' } = req.query;

    if (!emoji || typeof emoji !== 'string') {
      return res.status(400).json({ error: 'emoji required' });
    }

    const userChats = await prisma.chatMember.findMany({
      where: { userId },
      select: { chatId: true },
    });
    const chatIds = userChats.map(c => c.chatId);

    const where: any = {
      message: { chatId: { in: chatIds } },
      emoji,
    };
    if (chatId) where.message.chatId = chatId;

    const [reactions, total] = await Promise.all([
      prisma.reaction.findMany({
        where,
        include: {
          message: {
            include: {
              sender: { select: { id: true, username: true, displayName: true, avatar: true } },
              chat: { select: { id: true, name: true, type: true } },
              media: true,
            },
          },
          user: { select: { id: true, username: true, displayName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Number(limit), 100),
        skip: Number(offset),
      }),
      prisma.reaction.count({ where }),
    ]);

    res.json({ reactions, total });
  } catch (error) {
    console.error('Search reactions error:', error);
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

// Search messages by media type
router.get('/media-type', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { type, chatId, limit = '50', offset = '0' } = req.query;

    if (!type || typeof type !== 'string') {
      return res.status(400).json({ error: 'type required (photo, video, audio, file)' });
    }

    const userChats = await prisma.chatMember.findMany({
      where: { userId },
      select: { chatId: true },
    });
    const chatIds = userChats.map(c => c.chatId);

    const mediaTypeMap: Record<string, string[]> = {
      photo: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      video: ['video/mp4', 'video/webm', 'video/quicktime'],
      audio: ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp4'],
    };

    const mimeTypes = mediaTypeMap[type];
    const where: any = {
      message: { chatId: { in: chatIds } },
      ...(mimeTypes ? { mimeType: { in: mimeTypes } } : { type: { contains: type } }),
    };
    if (chatId) where.message.chatId = chatId;

    const [media, total] = await Promise.all([
      prisma.media.findMany({
        where,
        include: {
          message: {
            include: {
              sender: { select: { id: true, username: true, displayName: true, avatar: true } },
              chat: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { message: { createdAt: 'desc' } },
        take: Math.min(Number(limit), 100),
        skip: Number(offset),
      }),
      prisma.media.count({ where }),
    ]);

    res.json({ media, total });
  } catch (error) {
    console.error('Search media type error:', error);
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

// Search by date range (enhanced)
router.get('/by-date', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { dateFrom, dateTo, chatId, senderId, limit = '50', offset = '0' } = req.query;

    const userChats = await prisma.chatMember.findMany({
      where: { userId },
      select: { chatId: true },
    });
    const chatIds = userChats.map(c => c.chatId);

    const where: any = {
      chatId: { in: chatIds },
      isDeleted: false,
    };

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom as string);
      if (dateTo) where.createdAt.lte = new Date(dateTo as string);
    }
    if (chatId) where.chatId = chatId as string;
    if (senderId) where.senderId = senderId as string;

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        include: {
          sender: { select: { id: true, username: true, displayName: true, avatar: true } },
          chat: { select: { id: true, name: true, type: true } },
          media: true,
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Number(limit), 100),
        skip: Number(offset),
      }),
      prisma.message.count({ where }),
    ]);

    res.json({ messages, total });
  } catch (error) {
    console.error('Search by date error:', error);
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

// Search messages with mentions
router.get('/mentions', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { limit = '50', offset = '0' } = req.query;

    const [mentions, total] = await Promise.all([
      prisma.mention.findMany({
        where: { userId },
        include: {
          message: {
            include: {
              sender: { select: { id: true, username: true, displayName: true, avatar: true } },
              chat: { select: { id: true, name: true, type: true } },
              media: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Number(limit), 100),
        skip: Number(offset),
      }),
      prisma.mention.count({ where: { userId } }),
    ]);

    res.json({ mentions, total });
  } catch (error) {
    console.error('Search mentions error:', error);
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

// Search messages by thread
router.get('/threads', async (req: AuthRequest, res) => {
  try {
    const { threadId, limit = '50', offset = '0' } = req.query;

    if (!threadId) return res.status(400).json({ error: 'threadId required' });

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { threadId: threadId as string, isDeleted: false },
        include: {
          sender: { select: { id: true, username: true, displayName: true, avatar: true } },
          media: true,
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Number(limit), 100),
        skip: Number(offset),
      }),
      prisma.message.count({ where: { threadId: threadId as string, isDeleted: false } }),
    ]);

    res.json({ messages, total });
  } catch (error) {
    console.error('Search threads error:', error);
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

// Search saved/bookmarked messages
router.get('/bookmarks', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { q, limit = '50', offset = '0' } = req.query;

    const where: any = { userId };
    if (q && typeof q === 'string') {
      where.message = { content: { contains: q } };
    }

    const [bookmarks, total] = await Promise.all([
      prisma.bookmark.findMany({
        where,
        include: {
          message: {
            include: {
              sender: { select: { id: true, username: true, displayName: true, avatar: true } },
              chat: { select: { id: true, name: true } },
              media: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Number(limit), 100),
        skip: Number(offset),
      }),
      prisma.bookmark.count({ where }),
    ]);

    res.json({ bookmarks, total });
  } catch (error) {
    console.error('Search bookmarks error:', error);
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

export default router;
