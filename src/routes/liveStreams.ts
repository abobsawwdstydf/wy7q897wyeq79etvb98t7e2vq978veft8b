import { Router } from 'express';
import { prisma } from '../db';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { getIO } from '../socket';

const router = Router();

// Создать стрим
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { channelId, title, description, thumbnailUrl, streamUrl } = req.body;

    if (!channelId || !title || !streamUrl) {
      return res.status(400).json({ error: 'Заполните все обязательные поля' });
    }

    // Проверяем права (админ канала)
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: channelId, userId } }
    });

    if (!member || (member.role !== 'admin' && member.role !== 'owner')) {
      return res.status(403).json({ error: 'Нет прав' });
    }

    const stream = await prisma.liveStream.create({
      data: {
        channelId,
        streamerId: userId,
        title,
        description,
        thumbnailUrl,
        streamUrl
      }
    });

    // Уведомляем подписчиков
    const io = getIO();
    io.to(`chat:${channelId}`).emit('stream:started', { stream });

    res.json(stream);
  } catch (error: any) {
    console.error('Error creating stream:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить активные стримы
router.get('/active', authenticateToken, async (_req: AuthRequest, res) => {
  try {
    const streams = await prisma.liveStream.findMany({
      where: { isLive: true },
      orderBy: { viewerCount: 'desc' }
    });

    res.json(streams);
  } catch (error: any) {
    console.error('Error fetching streams:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить стрим
router.get('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const stream = await prisma.liveStream.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 50
        },
        donations: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });

    if (!stream) {
      return res.status(404).json({ error: 'Стрим не найден' });
    }

    res.json(stream);
  } catch (error: any) {
    console.error('Error fetching stream:', error);
    res.status(500).json({ error: error.message });
  }
});

// Завершить стрим
router.post('/:id/end', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId =   req.userId!;
    const { id } = req.params;
    const { recordingUrl } = req.body;

    const stream = await prisma.liveStream.findUnique({
      where: { id }
    });

    if (!stream) {
      return res.status(404).json({ error: 'Стрим не найден' });
    }

    if (stream.streamerId !== userId) {
      return res.status(403).json({ error: 'Нет прав' });
    }

    const updated = await prisma.liveStream.update({
      where: { id },
      data: {
        isLive: false,
        endedAt: new Date(),
        recordingUrl
      }
    });

    // Уведомляем зрителей
    const io = getIO();
    io.to(`stream:${id}`).emit('stream:ended', { stream: updated });

    res.json(updated);
  } catch (error: any) {
    console.error('Error ending stream:', error);
    res.status(500).json({ error: error.message });
  }
});

// Отправить сообщение в чат стрима
router.post('/:id/messages', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId =   req.userId!;
    const { id } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content обязателен' });
    }

    const message = await prisma.streamMessage.create({
      data: {
        streamId: id,
        userId,
        content
      }
    });

    // Отправляем в реальном времени
    const io = getIO();
    io.to(`stream:${id}`).emit('stream:message', { message });

    res.json(message);
  } catch (error: any) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: error.message });
  }
});

// Отправить донат во время стрима
router.post('/:id/donate', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId =   req.userId!;
    const { id } = req.params;
    const { amount, message } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'amount обязателен' });
    }

    const stream = await prisma.liveStream.findUnique({
      where: { id }
    });

    if (!stream) {
      return res.status(404).json({ error: 'Стрим не найден' });
    }

    // Проверяем баланс
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || user.beavers < amount) {
      return res.status(400).json({ error: 'Недостаточно бобров' });
    }

    // Создаём донат
    const donation = await prisma.streamDonation.create({
      data: {
        streamId: id,
        userId,
        amount,
        message
      }
    });

    // Списываем бобры
    await prisma.user.update({
      where: { id: userId },
      data: {
        beavers: { decrement: amount },
        totalSpent: { increment: amount }
      }
    });

    // Начисляем стримеру
    await prisma.user.update({
      where: { id: stream.streamerId },
      data: {
        beavers: { increment: amount },
        totalEarned: { increment: amount }
      }
    });

    // Анимация доната
    const io = getIO();
    io.to(`stream:${id}`).emit('stream:donation', { donation });

    res.json(donation);
  } catch (error: any) {
    console.error('Error sending donation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Обновить количество зрителей
router.post('/:id/viewers', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { count } = req.body;

    await prisma.liveStream.update({
      where: { id },
      data: { viewerCount: count }
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating viewers:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
