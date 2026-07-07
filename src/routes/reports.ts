import express from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();

// Создать жалобу
router.post('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { targetType, targetId, reason, description } = req.body;

    if (!targetType || !targetId || !reason) {
      return res.status(400).json({ error: 'targetType, targetId, reason required' });
    }

    if (!['message', 'user', 'chat', 'wall_post', 'wall_comment', 'story'].includes(targetType)) {
      return res.status(400).json({ error: 'Invalid targetType' });
    }

    const existing = await prisma.contentReport.findFirst({
      where: { reporterId: userId, targetType, targetId, status: { not: 'dismissed' } }
    });

    if (existing) {
      return res.status(409).json({ error: 'Already reported' });
    }

    const report = await prisma.contentReport.create({
      data: {
        reporterId: userId,
        targetType,
        targetId,
        reason,
        description: description || null,
      },
    });

    res.json(report);
  } catch (error) {
    console.error('Create report error:', error);
    res.status(500).json({ error: 'Failed to create report' });
  }
});

// Получить жалобы (admin)
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { status = 'pending', limit = 50, offset = 0 } = req.query;

    const reports = await prisma.contentReport.findMany({
      where: { status: status as string },
      include: {
        reporter: {
          select: { id: true, username: true, displayName: true, avatar: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset),
    });

    const total = await prisma.contentReport.count({
      where: { status: status as string },
    });

    res.json({ reports, total });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ error: 'Failed to get reports' });
  }
});

// Обработать жалобу (admin)
router.post('/:reportId/action', async (req: AuthRequest, res) => {
  try {
    const { reportId } = req.params;
    const { action, note } = req.body;

    if (!['warn', 'delete_content', 'ban_user', 'dismiss'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const report = await prisma.contentReport.findUnique({ where: { id: reportId } });
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const statusMap: Record<string, string> = {
      warn: 'resolved',
      delete_content: 'resolved',
      ban_user: 'resolved',
      dismiss: 'dismissed',
    };

    await prisma.contentReport.update({
      where: { id: reportId },
      data: {
        status: statusMap[action],
        reviewedBy: req.userId!,
        reviewedAt: new Date(),
        reviewNote: note || null,
      },
    });

    if (action === 'delete_content' && report.targetType === 'message') {
      await prisma.message.update({
        where: { id: report.targetId },
        data: { isDeleted: true },
      }).catch(() => {});
    }

    if (action === 'ban_user') {
      await prisma.user.update({
        where: { id: report.targetId },
        data: { isBanned: true, banReason: `Content report: ${report.reason}` },
      }).catch(() => {});
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Action report error:', error);
    res.status(500).json({ error: 'Failed to process report' });
  }
});

// Статистика жалоб (admin)
router.get('/stats', async (req: AuthRequest, res) => {
  try {
    const [pending, resolved, dismissed, total] = await Promise.all([
      prisma.contentReport.count({ where: { status: 'pending' } }),
      prisma.contentReport.count({ where: { status: 'resolved' } }),
      prisma.contentReport.count({ where: { status: 'dismissed' } }),
      prisma.contentReport.count(),
    ]);

    const byType = await prisma.contentReport.groupBy({
      by: ['targetType'],
      _count: true,
      where: { status: 'pending' },
    });

    const byReason = await prisma.contentReport.groupBy({
      by: ['reason'],
      _count: true,
      where: { status: 'pending' },
    });

    res.json({ pending, resolved, dismissed, total, byType, byReason });
  } catch (error) {
    console.error('Report stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

export default router;
