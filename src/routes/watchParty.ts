import express from 'express';
import { prisma } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

/**
 * POST /api/watch-party/create — Создать сессию совместного просмотра
 */
router.post('/create', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { callId, videoUrl, videoTitle } = req.body;

    if (!callId || !videoUrl) {
      return res.status(400).json({ error: 'callId и videoUrl обязательны' });
    }

    // Проверяем, что пользователь участвует в звонке
    const call = await prisma.callLog.findFirst({
      where: {
        id: String(callId),
        OR: [
          { callerId: userId },
          { calleeId: userId },
        ],
      },
    });

    if (!call) {
      return res.status(404).json({ error: 'Звонок не найден' });
    }

    // Создаём сессию совместного просмотра
    const watchParty = await prisma.watchParty.create({
      data: {
        callId: String(callId),
        hostId: userId,
        videoUrl: String(videoUrl),
        videoTitle: videoTitle ? String(videoTitle) : 'Видео',
        isPlaying: false,
        currentTime: 0,
        participants: {
          create: {
            userId,
            isReady: true,
          },
        },
      },
      include: {
        participants: true,
      },
    });

    res.json(watchParty);
  } catch (error) {
    console.error('Create watch party error:', error);
    res.status(500).json({ error: 'Ошибка создания сессии просмотра' });
  }
});

/**
 * GET /api/watch-party/:callId — Получить сессию по ID звонка
 */
router.get('/:callId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const callId = String(req.params.callId);

    const watchParty = await prisma.watchParty.findUnique({
      where: { callId },
      include: {
        participants: true,
      },
    });

    if (!watchParty) {
      return res.status(404).json({ error: 'Сессия не найдена' });
    }

    res.json(watchParty);
  } catch (error) {
    console.error('Get watch party error:', error);
    res.status(500).json({ error: 'Ошибка получения сессии' });
  }
});

/**
 * POST /api/watch-party/:partyId/join — Присоединиться к просмотру
 */
router.post('/:partyId/join', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const partyId = String(req.params.partyId);

    const watchParty = await prisma.watchParty.findUnique({
      where: { id: partyId },
    });

    if (!watchParty) {
      return res.status(404).json({ error: 'Сессия не найдена' });
    }

    // Добавляем участника
    const participant = await prisma.watchPartyParticipant.upsert({
      where: {
        partyId_userId: {
          partyId,
          userId,
        },
      },
      create: {
        partyId,
        userId,
        isReady: false,
      },
      update: {
        isReady: false,
      },
    });

    res.json(participant);
  } catch (error) {
    console.error('Join watch party error:', error);
    res.status(500).json({ error: 'Ошибка присоединения к просмотру' });
  }
});

/**
 * POST /api/watch-party/:partyId/ready — Отметить готовность
 */
router.post('/:partyId/ready', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const partyId = String(req.params.partyId);
    const { isReady } = req.body;

    const participant = await prisma.watchPartyParticipant.update({
      where: {
        partyId_userId: {
          partyId,
          userId,
        },
      },
      data: {
        isReady: isReady !== false,
      },
    });

    res.json(participant);
  } catch (error) {
    console.error('Ready watch party error:', error);
    res.status(500).json({ error: 'Ошибка обновления статуса' });
  }
});

/**
 * POST /api/watch-party/:partyId/sync — Синхронизация воспроизведения
 */
router.post('/:partyId/sync', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const partyId = String(req.params.partyId);
    const { isPlaying, currentTime } = req.body;

    const watchParty = await prisma.watchParty.findUnique({
      where: { id: partyId },
    });

    if (!watchParty) {
      return res.status(404).json({ error: 'Сессия не найдена' });
    }

    // Только хост может управлять воспроизведением
    if (watchParty.hostId !== userId) {
      return res.status(403).json({ error: 'Только хост может управлять воспроизведением' });
    }

    const updated = await prisma.watchParty.update({
      where: { id: partyId },
      data: {
        isPlaying: isPlaying !== undefined ? isPlaying : watchParty.isPlaying,
        currentTime: currentTime !== undefined ? currentTime : watchParty.currentTime,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Sync watch party error:', error);
    res.status(500).json({ error: 'Ошибка синхронизации' });
  }
});

/**
 * DELETE /api/watch-party/:partyId — Завершить сессию
 */
router.delete('/:partyId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const partyId = String(req.params.partyId);

    const watchParty = await prisma.watchParty.findUnique({
      where: { id: partyId },
    });

    if (!watchParty) {
      return res.status(404).json({ error: 'Сессия не найдена' });
    }

    // Только хост может завершить сессию
    if (watchParty.hostId !== userId) {
      return res.status(403).json({ error: 'Только хост может завершить сессию' });
    }

    await prisma.watchParty.delete({
      where: { id: partyId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete watch party error:', error);
    res.status(500).json({ error: 'Ошибка завершения сессии' });
  }
});

export default router;
