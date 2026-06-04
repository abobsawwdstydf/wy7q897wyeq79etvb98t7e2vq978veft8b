import express from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();

// Get user status (uses UserStatus model - Status was merged into UserStatus)
router.get('/:userId', async (req: AuthRequest, res) => {
  try {
    const userId = String(req.params.userId);

    const status = await prisma.userStatus.findUnique({
      where: { userId }
    });

    // Check if status expired
    if (status && status.expiresAt && status.expiresAt < new Date()) {
      await prisma.userStatus.delete({ where: { userId } });
      return res.json(null);
    }

    res.json(status);
  } catch (error) {
    console.error('Error fetching status:', error);
    res.status(500).json({ error: 'Ошибка получения статуса' });
  }
});

// Set user status
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { text, emoji, expiresIn } = req.body;
    const userId = req.userId!;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Текст статуса обязателен' });
    }

    if (text.length > 200) {
      return res.status(400).json({ error: 'Статус слишком длинный (макс. 200 символов)' });
    }

    let expiresAt: Date | null = null;
    if (expiresIn) {
      const hours = parseInt(expiresIn);
      if (!isNaN(hours) && hours > 0) {
        expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
      }
    }

    const status = await prisma.userStatus.upsert({
      where: { userId },
      create: {
        userId,
        text: text.trim(),
        emoji: emoji || null,
        expiresAt
      },
      update: {
        text: text.trim(),
        emoji: emoji || null,
        expiresAt,
        updatedAt: new Date()
      }
    });

    res.json(status);
  } catch (error) {
    console.error('Error setting status:', error);
    res.status(500).json({ error: 'Ошибка установки статуса' });
  }
});

// Delete user status
router.delete('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    await prisma.userStatus.delete({
      where: { userId }
    }).catch(() => {});

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting status:', error);
    res.status(500).json({ error: 'Ошибка удаления статуса' });
  }
});

// Get statuses of multiple users (for chat list)
router.post('/batch', async (req: AuthRequest, res) => {
  try {
    const { userIds } = req.body;

    if (!Array.isArray(userIds)) {
      return res.status(400).json({ error: 'userIds должен быть массивом' });
    }

    const statuses = await prisma.userStatus.findMany({
      where: {
        userId: { in: userIds },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      }
    });

    const statusMap: Record<string, any> = {};
    statuses.forEach(status => {
      statusMap[status.userId] = status;
    });

    res.json(statusMap);
  } catch (error) {
    console.error('Error fetching batch statuses:', error);
    res.status(500).json({ error: 'Ошибка получения статусов' });
  }
});

export default router;
