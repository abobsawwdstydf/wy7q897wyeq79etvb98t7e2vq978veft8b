import { Router } from 'express';
import { prisma } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Get map routes for a chat
router.get('/chat/:chatId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.userId!;

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!member) {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }

    const routes = await prisma.mapRoute.findMany({
      where: { chatId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ routes });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Get single route
router.get('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const route = await prisma.mapRoute.findUnique({ where: { id } });
    if (!route) {
      res.status(404).json({ error: 'Маршрут не найден' });
      return;
    }
    res.json({ route });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Create map route
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { chatId, fromLat, fromLng, fromName, toLat, toLng, toName, transport, routeData, messageId } = req.body;

    if (!chatId || fromLat === undefined || fromLng === undefined || toLat === undefined || toLng === undefined) {
      res.status(400).json({ error: 'Обязательные поля: chatId, fromLat, fromLng, toLat, toLng' });
      return;
    }

    // Validate coordinates
    if (Math.abs(fromLat) > 90 || Math.abs(toLat) > 90 || Math.abs(fromLng) > 180 || Math.abs(toLng) > 180) {
      res.status(400).json({ error: 'Некорректные координаты' });
      return;
    }

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!member) {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }

    const validTransports = ['walking', 'driving', 'transit', 'cycling'];
    const safeTransport = validTransports.includes(transport) ? transport : 'walking';

    const route = await prisma.mapRoute.create({
      data: {
        chatId,
        senderId: userId,
        messageId: messageId || null,
        fromLat: Number(fromLat),
        fromLng: Number(fromLng),
        fromName: fromName?.trim().slice(0, 200) || null,
        toLat: Number(toLat),
        toLng: Number(toLng),
        toName: toName?.trim().slice(0, 200) || null,
        transport: safeTransport,
        routeData: routeData ? JSON.stringify(routeData) : null,
      },
    });

    res.json({ route });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
