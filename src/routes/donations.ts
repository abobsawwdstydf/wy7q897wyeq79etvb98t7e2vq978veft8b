import { Router } from 'express';
import { prisma } from '../db';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { getIO } from '../socket';

const router = Router();

// Отправить донат
router.post('/send', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { recipientId, amount, message, isAnonymous } = req.body;

    if (!recipientId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'recipientId и amount обязательны' });
    }

    // Проверяем баланс
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || user.beavers < amount) {
      return res.status(400).json({ error: 'Недостаточно бобров' });
    }

    // Создаём донат (без sender/recipient relations, у модели только id-поля)
    const donation = await prisma.donation.create({
      data: {
        senderId: userId,
        recipientId,
        amount,
        message,
        isAnonymous: isAnonymous || false
      }
    });

    // Получаем инфу об отправителе и получателе
    const [sender, recipient] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, displayName: true, avatar: true }
      }),
      prisma.user.findUnique({
        where: { id: recipientId },
        select: { id: true, username: true, displayName: true, avatar: true }
      })
    ]);

    // Списываем бобры у отправителя
    await prisma.user.update({
      where: { id: userId },
      data: {
        beavers: { decrement: amount },
        totalSpent: { increment: amount }
      }
    });

    // Начисляем бобры получателю
    await prisma.user.update({
      where: { id: recipientId },
      data: {
        beavers: { increment: amount },
        totalEarned: { increment: amount }
      }
    });

    // Создаём транзакции
    await prisma.transaction.createMany({
      data: [
        {
          userId,
          amount: -amount,
          type: 'donation_sent',
          description: `Донат для ${recipient?.username ?? recipientId}`,
          relatedId: donation.id
        },
        {
          userId: recipientId,
          amount,
          type: 'donation_received',
          description: isAnonymous ? 'Анонимный донат' : `Донат от ${sender?.username ?? userId}`,
          relatedId: donation.id
        }
      ]
    });

    // Socket уведомление
    const io = getIO();
    io.to(`user:${recipientId}`).emit('donation:received', {
      donation: {
        ...donation,
        sender: isAnonymous ? null : sender
      }
    });

    res.json({ ...donation, sender, recipient });
  } catch (error: any) {
    console.error('Error sending donation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить топ донатеров
router.get('/top/:userId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const { limit = '10' } = req.query;

    const topDonators = await prisma.donation.groupBy({
      by: ['senderId'],
      where: {
        recipientId: userId,
        isAnonymous: false
      },
      _sum: {
        amount: true
      },
      orderBy: {
        _sum: {
          amount: 'desc'
        }
      },
      take: parseInt(limit as string)
    });

    // Получаем информацию о пользователях
    const userIds = topDonators.map(d => d.senderId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, displayName: true, avatar: true }
    });

    const result = topDonators.map(d => ({
      user: users.find(u => u.id === d.senderId),
      totalAmount: d._sum.amount || 0
    }));

    res.json(result);
  } catch (error: any) {
    console.error('Error fetching top donators:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить историю донатов
router.get('/history', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { type = 'all', limit = '50' } = req.query;

    const where: any = {};

    if (type === 'sent') {
      where.senderId = userId;
    } else if (type === 'received') {
      where.recipientId = userId;
    } else {
      where.OR = [
        { senderId: userId },
        { recipientId: userId }
      ];
    }

    const donations = await prisma.donation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string)
    });

    // Получаем инфу о пользователях
    const userIds = [...new Set(donations.flatMap(d => [d.senderId, d.recipientId]))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, displayName: true, avatar: true }
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    // Скрываем отправителя для анонимных донатов
    const result = donations.map(d => ({
      ...d,
      sender: d.isAnonymous && d.recipientId === userId ? null : userMap.get(d.senderId) || null,
      recipient: userMap.get(d.recipientId) || null
    }));

    res.json(result);
  } catch (error: any) {
    console.error('Error fetching donation history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Установить цель по сбору средств
router.post('/goal', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { title, targetAmount, description, endsAt } = req.body;

    if (!title || !targetAmount) {
      return res.status(400).json({ error: 'title и targetAmount обязательны' });
    }

    const goal = await prisma.donationGoal.create({
      data: {
        userId,
        title,
        targetAmount,
        description,
        endsAt: endsAt ? new Date(endsAt) : null
      }
    });

    res.json(goal);
  } catch (error: any) {
    console.error('Error creating goal:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить цели пользователя
router.get('/goals/:userId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;

    const goals = await prisma.donationGoal.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' }
    });

    // Подсчитываем прогресс
    const result = await Promise.all(goals.map(async (goal) => {
      const donations = await prisma.donation.aggregate({
        where: {
          recipientId: userId,
          createdAt: { gte: goal.createdAt }
        },
        _sum: {
          amount: true
        }
      });

      return {
        ...goal,
        currentAmount: donations._sum.amount || 0,
        progress: Math.min(100, ((donations._sum.amount || 0) / goal.targetAmount) * 100)
      };
    }));

    res.json(result);
  } catch (error: any) {
    console.error('Error fetching goals:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
