import { Router } from 'express';
import { prisma } from '../db';
import { AuthRequest, authenticateToken } from '../middleware/auth';

const router = Router();

// Установить таймер исчезающих сообщений для чата
router.post('/chat/:chatId/timer', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId =   req.userId!;
    const { chatId } = req.params;
    const { timer } = req.body; // в секундах (0 = выключено)

    // Проверяем права
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } }
    });

    if (!member || (member.role !== 'admin' && member.role !== 'owner')) {
      return res.status(403).json({ error: 'Нет прав' });
    }

    const settings = await prisma.disappearingMessageSettings.upsert({
      where: { chatId },
      create: {
        chatId,
        timer,
        enabledBy: userId
      },
      update: {
        timer,
        enabledBy: userId,
        updatedAt: new Date()
      }
    });

    res.json(settings);
  } catch (error: any) {
    console.error('Error setting timer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить настройки исчезающих сообщений
router.get('/chat/:chatId/timer', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { chatId } = req.params;

    const settings = await prisma.disappearingMessageSettings.findUnique({
      where: { chatId }
    });

    res.json(settings || { timer: 0 });
  } catch (error: any) {
    console.error('Error fetching timer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Отметить сообщение как прочитанное (запускает таймер)
router.post('/message/:messageId/read', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId =   req.userId!;
    const { messageId } = req.params;

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: { chat: true }
    });

    if (!message) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }

    // Проверяем настройки исчезающих сообщений
    const settings = await prisma.disappearingMessageSettings.findUnique({
      where: { chatId: message.chatId }
    });

    if (settings && settings.timer > 0) {
      const deleteAt = new Date(Date.now() + settings.timer * 1000);

      await prisma.disappearingMessage.create({
        data: {
          messageId,
          deleteAt,
          readBy: userId
        }
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error marking message read:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cleanup job (вызывается периодически)
router.post('/cleanup', async (_req, res) => {
  try {
    const now = new Date();

    // Находим сообщения для удаления
    const toDelete = await prisma.disappearingMessage.findMany({
      where: {
        deleteAt: { lte: now }
      }
    });

    const messageIds = toDelete.map(d => d.messageId);

    if (messageIds.length > 0) {
      // Удаляем сообщения
      await prisma.message.updateMany({
        where: { id: { in: messageIds } },
        data: {
          isDeleted: true,
          content: null,
          encryptedContent: null
        }
      });

      // Удаляем записи
      await prisma.disappearingMessage.deleteMany({
        where: { messageId: { in: messageIds } }
      });
    }

    res.json({ deleted: messageIds.length });
  } catch (error: any) {
    console.error('Error cleaning up messages:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
