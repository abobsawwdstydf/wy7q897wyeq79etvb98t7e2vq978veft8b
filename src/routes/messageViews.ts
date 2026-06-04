import { Router } from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Отметить просмотр поста в канале
router.post('/:messageId/view', async (req: AuthRequest, res) => {
  try {
    const messageId = String(req.params.messageId);
    const userId = req.userId!;

    // Generate a simple device ID from user agent + IP
    const deviceId = `${req.ip || 'unknown'}-${req.get('user-agent') || 'unknown'}`.slice(0, 100);

    // Check if already viewed today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingView = await prisma.messageView.findFirst({
      where: {
        messageId: messageId as string,
        userId,
        deviceId,
        viewedAt: { gte: today },
      },
    });

    if (existingView) {
      // Return current view count
      const viewCount = await prisma.messageView.count({ where: { messageId: messageId as string } });
      res.json({ viewCount });
      return;
    }

    // Create new view
    await prisma.messageView.create({
      data: {
        messageId: messageId as string,
        userId,
        deviceId,
      },
    });

    // Get updated view count
    const viewCount = await prisma.messageView.count({ where: { messageId: messageId as string } });

    res.json({ viewCount });
  } catch (error) {
    console.error('Mark post viewed error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
