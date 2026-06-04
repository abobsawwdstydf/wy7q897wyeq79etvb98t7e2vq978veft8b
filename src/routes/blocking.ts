import { Router } from 'express';
import { prisma } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Заблокировать пользователя
router.post('/users/:id/block', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const blockedUserId = req.params.id;

    if (userId === blockedUserId) {
      res.status(400).json({ error: 'Нельзя заблокировать самого себя' });
      return;
    }

    // Проверяем, существует ли пользователь
    const targetUser = await prisma.user.findUnique({
      where: { id: blockedUserId },
      select: { id: true },
    });

    if (!targetUser) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    // Создаём блокировку (если уже есть - игнорируем)
    await prisma.blockedUser.upsert({
      where: {
        userId_blockedUserId: {
          userId,
          blockedUserId,
        },
      },
      create: {
        userId,
        blockedUserId,
      },
      update: {},
    });

    res.json({ success: true, message: 'Пользователь заблокирован' });
  } catch (err) {
    console.error('Error blocking user:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Разблокировать пользователя
router.delete('/users/:id/block', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const blockedUserId = req.params.id;

    await prisma.blockedUser.deleteMany({
      where: {
        userId,
        blockedUserId,
      },
    });

    res.json({ success: true, message: 'Пользователь разблокирован' });
  } catch (err) {
    console.error('Error unblocking user:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить список заблокированных пользователей
router.get('/users/blocked', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const blocked = await prisma.blockedUser.findMany({
      where: { userId },
      include: {
        blockedUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            isVerified: true,
            verifiedBadgeUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      blocked: blocked.map(b => ({
        id: b.id,
        blockedAt: b.createdAt,
        user: b.blockedUser,
      })),
    });
  } catch (err) {
    console.error('Error fetching blocked users:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Проверить, заблокирован ли пользователь
router.get('/users/:id/is-blocked', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const targetUserId = req.params.id;

    const blocked = await prisma.blockedUser.findUnique({
      where: {
        userId_blockedUserId: {
          userId,
          blockedUserId: targetUserId,
        },
      },
    });

    res.json({ isBlocked: !!blocked });
  } catch (err) {
    console.error('Error checking block status:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
