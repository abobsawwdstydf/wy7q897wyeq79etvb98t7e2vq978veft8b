import { Router } from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Получить все фоны пользователя для всех чатов (ДОЛЖНО БЫТЬ ДО /:chatId)
router.get('/', async (req: AuthRequest, res) => {
  try {
    const backgrounds = await prisma.chatBackground.findMany({
      where: { userId: req.userId! },
    });
    res.json(backgrounds);
  } catch (error) {
    console.error('Get all chat backgrounds error:', error);
    res.status(500).json({ error: 'Ошибка получения фонов' });
  }
});

// Получить фон для конкретного чата
router.get('/:chatId', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.chatId);

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member) {
      res.status(403).json({ error: 'Доступ запрещен' });
      return;
    }

    const background = await prisma.chatBackground.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    res.json(background || null);
  } catch (error) {
    console.error('Get chat background error:', error);
    res.status(500).json({ error: 'Ошибка получения фона' });
  }
});

// Установить фон для конкретного чата
router.post('/:chatId', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.chatId);
    const { backgroundUrl } = req.body;

    if (!backgroundUrl || typeof backgroundUrl !== 'string') {
      res.status(400).json({ error: 'backgroundUrl обязателен' });
      return;
    }

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member) {
      res.status(403).json({ error: 'Доступ запрещен' });
      return;
    }

    const background = await prisma.chatBackground.upsert({
      where: { chatId_userId: { chatId, userId: req.userId! } },
      update: { backgroundUrl },
      create: {
        chatId,
        userId: req.userId!,
        backgroundUrl,
      },
    });

    res.json(background);
  } catch (error) {
    console.error('Set chat background error:', error);
    res.status(500).json({ error: 'Ошибка установки фона' });
  }
});

// Удалить фон для конкретного чата
router.delete('/:chatId', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.chatId);

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member) {
      res.status(403).json({ error: 'Доступ запрещен' });
      return;
    }

    await prisma.chatBackground.deleteMany({
      where: { chatId, userId: req.userId! },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete chat background error:', error);
    res.status(500).json({ error: 'Ошибка удаления фона' });
  }
});

export default router;
