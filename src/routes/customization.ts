import express from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();

// Get chat customization
router.get('/chat/:chatId', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.chatId);
    const userId = req.userId!;

    let customization = await prisma.chatCustomization.findFirst({
      where: { chatId, userId }
    });

    if (!customization) {
      customization = await prisma.chatCustomization.create({
        data: {
          chatId,
          userId,
          customColor: null,
          customBackground: null,
          customSound: null
        }
      });
    }

    res.json(customization);
  } catch (error) {
    console.error('Error fetching chat customization:', error);
    res.status(500).json({ error: 'Ошибка получения кастомизации чата' });
  }
});

// Update chat customization
router.put('/chat/:chatId', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.chatId);
    const { customColor, customBackground, customSound } = req.body;
    const userId = req.userId!;

    const customization = await prisma.chatCustomization.upsert({
      where: { chatId },
      create: {
        chatId,
        userId,
        customColor,
        customBackground,
        customSound
      },
      update: {
        ...(customColor !== undefined && { customColor }),
        ...(customBackground !== undefined && { customBackground }),
        ...(customSound !== undefined && { customSound })
      }
    });

    res.json(customization);
  } catch (error) {
    console.error('Error updating chat customization:', error);
    res.status(500).json({ error: 'Ошибка обновления кастомизации чата' });
  }
});

// Delete chat customization (reset to default)
router.delete('/chat/:chatId', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.chatId);
    const userId = req.userId!;

    await prisma.chatCustomization.deleteMany({
      where: { chatId, userId }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting chat customization:', error);
    res.status(500).json({ error: 'Ошибка удаления кастомизации чата' });
  }
});

export default router;
