import express from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();

// Get all tags for a chat
router.get('/chat/:chatId', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.chatId);
    const userId = req.userId!;

    const tags = await prisma.chatTag.findMany({
      where: { chatId, userId },
      orderBy: { createdAt: 'desc' }
    });

    res.json(tags);
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ error: 'Ошибка получения тегов' });
  }
});

// Add tag to chat
router.post('/chat/:chatId', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.chatId);
    const { tag, color } = req.body;
    const userId = req.userId!;

    if (!tag || tag.trim().length === 0) {
      return res.status(400).json({ error: 'Тег обязателен' });
    }

    // Check if user is member
    const member = await prisma.chatMember.findFirst({
      where: { chatId, userId }
    });

    if (!member) {
      return res.status(403).json({ error: 'Вы не являетесь участником этого чата' });
    }

    // Check if tag already exists
    const existing = await prisma.chatTag.findUnique({
      where: {
        chatId_userId_tag: {
          chatId,
          userId,
          tag: tag.trim()
        }
      }
    });

    if (existing) {
      return res.status(400).json({ error: 'Этот тег уже существует' });
    }

    const chatTag = await prisma.chatTag.create({
      data: {
        chatId,
        userId,
        tag: tag.trim(),
        color
      }
    });

    res.json(chatTag);
  } catch (error) {
    console.error('Error creating tag:', error);
    res.status(500).json({ error: 'Ошибка создания тега' });
  }
});

// Delete tag
router.delete('/:tagId', async (req: AuthRequest, res) => {
  try {
    const tagId = String(req.params.tagId);
    const userId = req.userId!;

    const tag = await prisma.chatTag.findUnique({
      where: { id: tagId }
    });

    if (!tag || tag.userId !== userId) {
      return res.status(403).json({ error: 'Нет доступа к этому тегу' });
    }

    await prisma.chatTag.delete({
      where: { id: tagId }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting tag:', error);
    res.status(500).json({ error: 'Ошибка удаления тега' });
  }
});

// Get all user's tags
router.get('/user', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const tags = await prisma.chatTag.findMany({
      where: { userId },
      include: {
        chat: {
          select: {
            id: true,
            name: true,
            type: true,
            avatar: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(tags);
  } catch (error) {
    console.error('Error fetching user tags:', error);
    res.status(500).json({ error: 'Ошибка получения тегов пользователя' });
  }
});

export default router;
