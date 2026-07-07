import { Router } from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Получить историю звонков
router.get('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const calls = await prisma.callLog.findMany({
      where: {
        OR: [
          { callerId: userId },
          { calleeId: userId },
        ],
      },
      include: {
        caller: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
          },
        },
        callee: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json(calls);
  } catch (error) {
    console.error('Get call history error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать запись о звонке
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { calleeId, chatId, type, status, duration } = req.body;

    if (!calleeId) {
      res.status(400).json({ error: 'calleeId обязателен' });
      return;
    }

    const call = await prisma.callLog.create({
      data: {
        callerId: req.userId!,
        calleeId,
        chatId: chatId || null,
        type: type || 'voice',
        status: status || 'completed',
        duration: duration || 0,
      },
      include: {
        caller: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
          },
        },
        callee: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
          },
        },
      },
    });

    res.json(call);
  } catch (error) {
    console.error('Create call log error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
