import { Router } from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Get notification settings for a chat
router.get('/:chatId', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.chatId);
    const userId = req.userId!;

    let settings = await prisma.chatNotificationSetting.findUnique({
      where: { chatId_userId: { chatId, userId } }
    });

    if (!settings) {
      settings = await prisma.chatNotificationSetting.create({
        data: { chatId, userId }
      });
    }

    res.json(settings);
  } catch (error) {
    console.error('Get chat notification settings error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Update notification settings for a chat
router.put('/:chatId', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.chatId);
    const userId = req.userId!;
    const { enabled, sound, vibration, preview } = req.body;

    const settings = await prisma.chatNotificationSetting.upsert({
      where: { chatId_userId: { chatId, userId } },
      update: {
        ...(enabled !== undefined && { enabled }),
        ...(sound !== undefined && { sound }),
        ...(vibration !== undefined && { vibration }),
        ...(preview !== undefined && { preview }),
      },
      create: {
        chatId,
        userId,
        enabled: enabled ?? true,
        sound: sound ?? true,
        vibration: vibration ?? true,
        preview: preview ?? true,
      }
    });

    res.json(settings);
  } catch (error) {
    console.error('Update chat notification settings error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Get all chat notification settings for user
router.get('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const settings = await prisma.chatNotificationSetting.findMany({
      where: { userId }
    });

    res.json(settings);
  } catch (error) {
    console.error('Get all chat notification settings error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
