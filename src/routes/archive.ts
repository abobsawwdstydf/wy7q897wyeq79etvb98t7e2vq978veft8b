import express from 'express';
import { prisma } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

/**
 * POST /api/archive/:chatId — Архивировать чат
 */
router.post('/:chatId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const chatId = String(req.params.chatId);

    const member = await prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
    });

    if (!member) {
      return res.status(404).json({ error: 'Чат не найден' });
    }

    const updated = await prisma.chatMember.update({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
      data: {
        isArchived: true,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Archive chat error:', error);
    res.status(500).json({ error: 'Ошибка архивирования чата' });
  }
});

/**
 * DELETE /api/archive/:chatId — Разархивировать чат
 */
router.delete('/:chatId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const chatId = String(req.params.chatId);

    const member = await prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
    });

    if (!member) {
      return res.status(404).json({ error: 'Чат не найден' });
    }

    const updated = await prisma.chatMember.update({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
      data: {
        isArchived: false,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Unarchive chat error:', error);
    res.status(500).json({ error: 'Ошибка разархивирования чата' });
  }
});

/**
 * GET /api/archive — Получить все архивированные чаты
 */
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const archivedChats = await prisma.chatMember.findMany({
      where: {
        userId,
        isArchived: true,
      },
      include: {
        chat: {
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
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
            },
            members: {
              where: {
                userId: { not: userId },
              },
              take: 1,
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatar: true,
                    isOnline: true,
                    lastSeen: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        chat: {
          messages: {
            _count: 'desc',
          },
        },
      },
    });

    const formatted = archivedChats.map(member => ({
      ...member.chat,
      lastMessage: member.chat.messages[0] || null,
      otherMember: member.chat.members[0]?.user || null,
      isArchived: true,
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Get archived chats error:', error);
    res.status(500).json({ error: 'Ошибка получения архивированных чатов' });
  }
});

export default router;
