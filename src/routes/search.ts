import express from 'express';
import { prisma } from '../db';
import { Prisma } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();

/**
 * Global search with FTS5 full-text search support
 */
router.get('/global', async (req: AuthRequest, res) => {
  try {
    const { q, type, senderId, dateFrom, dateTo, limit = 50, offset = 0 } = req.query;
    const userId = req.userId!;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Search query required' });
    }

    const userChats = await prisma.chatMember.findMany({
      where: { userId },
      select: { chatId: true },
    });

    const chatIds = userChats.map(c => c.chatId);

    if (chatIds.length === 0) {
      return res.json({ messages: [], total: 0, limit: Number(limit), offset: Number(offset) });
    }

    // Try FTS5 search first, fall back to LIKE
    let messages: any[] = [];
    let total = 0;

    try {
      // FTS5 search — use raw query with the virtual table
      const chatIdList = chatIds.map(id => `'${id}'`).join(',');
      const ftsQuery = q.replace(/[^\w\s]/g, ' ').trim().split(/\s+/).filter(Boolean).join(' OR ');

      if (!ftsQuery) {
        throw new Error('Empty FTS query');
      }

      // Search via FTS5
      const ftsResults = await prisma.$queryRawUnsafe<any[]>(
        `SELECT m.*, m.rowid as rowid
         FROM "MessageFTS" fts
         JOIN "Message" m ON m.rowid = fts.rowid
         WHERE "MessageFTS" MATCH ?
         AND m."chatId" IN (${chatIdList})
         AND m."isDeleted" = false
         ORDER BY rank
         LIMIT ? OFFSET ?`,
        ftsQuery,
        Number(limit),
        Number(offset)
      );

      messages = ftsResults;

      const countResult = await prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) as count
         FROM "MessageFTS" fts
         JOIN "Message" m ON m.rowid = fts.rowid
         WHERE "MessageFTS" MATCH ?
         AND m."chatId" IN (${chatIdList})
         AND m."isDeleted" = false`,
        ftsQuery
      );
      total = Number(countResult[0]?.count || 0);
    } catch (ftsError) {
      // FTS5 not available, fall back to LIKE search
      console.warn('[Search] FTS5 unavailable, falling back to LIKE:', (ftsError as Error).message);

      const where: any = {
        chatId: { in: chatIds },
        isDeleted: false,
        OR: [
          { content: { contains: q } },
          { quote: { contains: q } },
        ],
      };

      if (type && typeof type === 'string') where.type = type;
      if (senderId && typeof senderId === 'string') where.senderId = senderId;
      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = new Date(dateFrom as string);
        if (dateTo) where.createdAt.lte = new Date(dateTo as string);
      }

      [messages, total] = await Promise.all([
        prisma.message.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: Number(limit),
          skip: Number(offset),
        }),
        prisma.message.count({ where }),
      ]);
    }

    // Enrich messages with sender and chat info
    if (messages.length > 0) {
      const messageIds = messages.map((m: any) => m.id);
      const [senders, chats, media] = await Promise.all([
        prisma.user.findMany({
          where: { id: { in: [...new Set(messages.map((m: any) => m.senderId))] } },
          select: { id: true, username: true, displayName: true, avatar: true },
        }),
        prisma.chat.findMany({
          where: { id: { in: [...new Set(messages.map((m: any) => m.chatId))] } },
          select: { id: true, type: true, name: true, avatar: true },
        }),
        prisma.media.findMany({
          where: { messageId: { in: messageIds } },
        }),
      ]);

      const senderMap = new Map(senders.map(s => [s.id, s]));
      const chatMap = new Map(chats.map(c => [c.id, c]));
      const mediaMap = new Map<string, any[]>();
      media.forEach(m => {
        const arr = mediaMap.get(m.messageId) || [];
        arr.push(m);
        mediaMap.set(m.messageId, arr);
      });

      messages = messages.map((m: any) => ({
        ...m,
        sender: senderMap.get(m.senderId) || null,
        chat: chatMap.get(m.chatId) || null,
        media: mediaMap.get(m.id) || [],
      }));
    }

    res.json({
      messages,
      total,
      limit: Number(limit),
      offset: Number(offset),
    });
  } catch (error) {
    console.error('Global search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * Search by hashtag
 */
router.get('/hashtag/:tag', async (req: AuthRequest, res) => {
  try {
    const tag = String(req.params.tag);
    const { limit = 50, offset = 0 } = req.query;
    const userId = req.userId!;

    const userChats = await prisma.chatMember.findMany({
      where: { userId },
      select: { chatId: true },
    });
    const chatIds = userChats.map(c => c.chatId);

    const hashtag = await prisma.hashtag.findUnique({
      where: { tag: tag.toLowerCase() },
    });

    if (!hashtag) {
      return res.json({ messages: [], total: 0 });
    }

    const messageHashtags = await prisma.messageHashtag.findMany({
      where: { hashtagId: hashtag.id },
      select: { messageId: true },
      take: Number(limit),
      skip: Number(offset),
    });

    const messageIds = messageHashtags.map(mh => mh.messageId);

    const messages = await prisma.message.findMany({
      where: {
        id: { in: messageIds },
        chatId: { in: chatIds },
        isDeleted: false,
      },
      include: {
        sender: {
          select: { id: true, username: true, displayName: true, avatar: true },
        },
        chat: {
          select: { id: true, type: true, name: true, avatar: true },
        },
        media: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const total = await prisma.messageHashtag.count({
      where: { hashtagId: hashtag.id },
    });

    res.json({ messages, total, limit: Number(limit), offset: Number(offset) });
  } catch (error) {
    console.error('Hashtag search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * Get trending hashtags
 */
router.get('/hashtags/trending', async (_req: AuthRequest, res) => {
  try {
    const hashtags = await prisma.hashtag.findMany({
      orderBy: { useCount: 'desc' },
      take: 20,
    });
    res.json(hashtags);
  } catch (error) {
    console.error('Trending hashtags error:', error);
    res.status(500).json({ error: 'Failed to get trending hashtags' });
  }
});

export default router;
