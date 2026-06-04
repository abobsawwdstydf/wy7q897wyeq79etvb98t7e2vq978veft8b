import express from 'express';
import { prisma } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

/**
 * GET /api/message-tags/search/:chatId — Поиск сообщений по тегу
 */
router.get('/search/:chatId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const chatId = String(req.params.chatId);
    const { tag } = req.query;

    if (!tag) {
      return res.status(400).json({ error: 'tag обязателен' });
    }

    // Проверяем доступ к чату
    const member = await prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
    });

    if (!member) {
      return res.status(403).json({ error: 'Нет доступа к чату' });
    }

    const tags = await prisma.messageTag.findMany({
      where: {
        userId,
        tag: tag as string,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Filter tags whose messages belong to this chat
    const messageIds = tags.map(t => t.messageId);
    const messages = await prisma.message.findMany({
      where: {
        id: { in: messageIds },
        chatId: chatId,
        isDeleted: false,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
          },
        },
      },
    });

    const tagMap = new Map(tags.map(t => [t.messageId, t]));
    const result = messages.map(m => ({
      ...m,
      tags: [{ id: tagMap.get(m.id)!.id, tag: tagMap.get(m.id)!.tag, color: tagMap.get(m.id)!.color }],
    }));

    res.json(result);
  } catch (error) {
    console.error('Search by tag error:', error);
    res.status(500).json({ error: 'Ошибка поиска по тегу' });
  }
});

/**
 * GET /api/message-tags/user/all — Получить все теги пользователя
 */
router.get('/user/all', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const tags = await prisma.messageTag.findMany({
      where: { userId },
      select: {
        tag: true,
        color: true,
      },
      distinct: ['tag'],
      orderBy: { tag: 'asc' },
    });

    res.json(tags);
  } catch (error) {
    console.error('Get user tags error:', error);
    res.status(500).json({ error: 'Ошибка получения тегов' });
  }
});

/**
 * GET /api/message-tags/:messageId — Получить теги сообщения
 */
router.get('/:messageId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const messageId = String(req.params.messageId);

    const tags = await prisma.messageTag.findMany({
      where: { messageId },
      orderBy: { createdAt: 'asc' },
    });

    res.json(tags);
  } catch (error) {
    console.error('Get message tags error:', error);
    res.status(500).json({ error: 'Ошибка получения тегов' });
  }
});

/**
 * POST /api/message-tags — Добавить тег к сообщению
 */
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { messageId, tag, color } = req.body;

    if (!messageId || !tag) {
      return res.status(400).json({ error: 'messageId и tag обязательны' });
    }

    // Проверяем доступ к сообщению
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        chat: {
          include: {
            members: {
              where: { userId },
            },
          },
        },
      },
    });

    if (!message || message.chat.members.length === 0) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }

    const messageTag = await prisma.messageTag.upsert({
      where: {
        messageId_userId_tag: {
          messageId,
          userId,
          tag: tag.trim(),
        },
      },
      create: {
        messageId,
        userId,
        tag: tag.trim(),
        color: color || '#3b82f6',
      },
      update: {
        color: color || '#3b82f6',
      },
    });

    res.json(messageTag);
  } catch (error) {
    console.error('Add message tag error:', error);
    res.status(500).json({ error: 'Ошибка добавления тега' });
  }
});

/**
 * DELETE /api/message-tags/:id — Удалить тег
 */
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const id = String(req.params.id);

    const tag = await prisma.messageTag.findUnique({
      where: { id },
    });

    if (!tag) {
      return res.status(404).json({ error: 'Тег не найден' });
    }

    if (tag.userId !== userId) {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    await prisma.messageTag.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete message tag error:', error);
    res.status(500).json({ error: 'Ошибка удаления тега' });
  }
});

export default router;
