import express from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();

// Set self-destruct timer for a message
router.post('/:messageId/self-destruct', async (req: AuthRequest, res) => {
  try {
    const messageId = String(req.params.messageId);
    const { timer } = req.body; // Timer in seconds
    const userId = req.userId!;

    if (!timer || timer < 5 || timer > 2592000) { // 5 sec to 30 days
      return res.status(400).json({ error: 'Таймер должен быть от 5 секунд до 30 дней' });
    }

    // Check if user is the sender
    const message = await prisma.message.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }

    if (message.senderId !== userId) {
      return res.status(403).json({ error: 'Только отправитель может установить таймер' });
    }

    const selfDestructAt = new Date(Date.now() + timer * 1000);

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: {
        selfDestructTimer: timer,
        selfDestructAt
      }
    });

    res.json(updated);
  } catch (error) {
    console.error('Error setting self-destruct timer:', error);
    res.status(500).json({ error: 'Ошибка установки таймера' });
  }
});

// Get messages with self-destruct timers
router.get('/self-destruct/pending', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const messages = await prisma.message.findMany({
      where: {
        senderId: userId,
        selfDestructAt: { not: null },
        isDeleted: false
      },
      orderBy: { selfDestructAt: 'asc' },
      take: 50
    });

    res.json(messages);
  } catch (error) {
    console.error('Error fetching self-destruct messages:', error);
    res.status(500).json({ error: 'Ошибка получения сообщений' });
  }
});

export default router;
