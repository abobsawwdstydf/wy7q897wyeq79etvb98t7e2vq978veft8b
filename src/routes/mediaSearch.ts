import express from 'express';
import { prisma } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

/**
 * POST /api/media-search/index — Индексировать медиа из сообщения
 */
router.post('/index', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { messageId } = req.body;

    if (!messageId) {
      return res.status(400).json({ error: 'messageId обязателен' });
    }

    const message = await prisma.message.findUnique({
      where: { id: String(messageId) },
      include: { media: true },
    });

    if (!message) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }

    const indexed = [];
    for (const media of message.media) {
      const existing = await prisma.mediaIndex.findFirst({
        where: { messageId: message.id, mediaUrl: media.url },
      });

      if (!existing) {
        const mediaIndex = await prisma.mediaIndex.create({
          data: {
            chatId: message.chatId,
            messageId: message.id,
            userId: message.senderId,
            mediaType: media.type,
            mediaUrl: media.url,
            filename: media.filename,
            mimeType: media.type,
            size: media.size,
            thumbnail: media.thumbnail,
          },
        });
        indexed.push(mediaIndex);
      }
    }

    res.json({ indexed: indexed.length });
  } catch (error) {
    console.error('Index media error:', error);
    res.status(500).json({ error: 'Ошибка индексации медиа' });
  }
});

/**
 * GET /api/media-search/stats/:chatId — Статистика медиа в чате
 * NOTE: must be before /:chatId to avoid route conflict
 */
router.get('/stats/:chatId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const chatId = String(req.params.chatId);

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });

    if (!member) {
      return res.status(403).json({ error: 'Нет доступа к чату' });
    }

    const stats = await prisma.mediaIndex.groupBy({
      by: ['mediaType'],
      where: { chatId },
      _count: { id: true },
      _sum: { size: true },
    });

    const formatted = stats.map((s: any) => ({
      type: s.mediaType,
      count: s._count.id,
      totalSize: s._sum.size || 0,
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Media stats error:', error);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

/**
 * GET /api/media-search/user/:targetUserId — Все медиа пользователя
 * NOTE: must be before /:chatId to avoid route conflict
 */
router.get('/user/:targetUserId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const targetUserId = String(req.params.targetUserId);
    const { type, limit = 50, offset = 0 } = req.query;

    const userChats = await prisma.chatMember.findMany({
      where: { userId },
      select: { chatId: true },
    });

    const chatIds = userChats.map(c => c.chatId);

    const where: any = {
      userId: targetUserId,
      chatId: { in: chatIds },
    };

    if (type) {
      where.mediaType = String(type);
    }

    const [media, total] = await Promise.all([
      prisma.mediaIndex.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
        skip: Number(offset),
      }),
      prisma.mediaIndex.count({ where }),
    ]);

    res.json({
      media,
      total,
      hasMore: total > Number(offset) + Number(limit),
    });
  } catch (error) {
    console.error('User media error:', error);
    res.status(500).json({ error: 'Ошибка получения медиа пользователя' });
  }
});

/**
 * GET /api/media-search/:chatId — Поиск медиа в чате
 */
router.get('/:chatId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const chatId = String(req.params.chatId);
    const { type, search, limit = 50, offset = 0 } = req.query;

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });

    if (!member) {
      return res.status(403).json({ error: 'Нет доступа к чату' });
    }

    const where: any = { chatId };

    if (type) {
      where.mediaType = String(type);
    }

    if (search) {
      where.filename = {
        contains: String(search),
      };
    }

    const [media, total] = await Promise.all([
      prisma.mediaIndex.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
        skip: Number(offset),
      }),
      prisma.mediaIndex.count({ where }),
    ]);

    res.json({
      media,
      total,
      hasMore: total > Number(offset) + Number(limit),
    });
  } catch (error) {
    console.error('Search media error:', error);
    res.status(500).json({ error: 'Ошибка поиска медиа' });
  }
});

export default router;
