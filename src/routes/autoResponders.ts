import express from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();

// Get all auto-responders for a chat
router.get('/chat/:chatId', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.chatId);
    const userId = req.userId!;

    // Check if user is member of the chat
    const member = await prisma.chatMember.findFirst({
      where: { chatId, userId }
    });

    if (!member) {
      return res.status(403).json({ error: 'Вы не являетесь участником этого чата' });
    }

    const autoResponders = await prisma.autoResponder.findMany({
      where: { chatId, userId },
      orderBy: { createdAt: 'desc' }
    });

    res.json(autoResponders);
  } catch (error) {
    console.error('Error fetching auto-responders:', error);
    res.status(500).json({ error: 'Ошибка получения автоответчиков' });
  }
});

// Create auto-responder
router.post('/chat/:chatId', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.chatId);
    const { trigger, response, onlyOffline } = req.body;
    const userId = req.userId!;

    if (!trigger || !response) {
      return res.status(400).json({ error: 'Триггер и ответ обязательны' });
    }

    // Check if user is member
    const member = await prisma.chatMember.findFirst({
      where: { chatId, userId }
    });

    if (!member) {
      return res.status(403).json({ error: 'Вы не являетесь участником этого чата' });
    }

    const autoResponder = await prisma.autoResponder.create({
      data: {
        chatId,
        userId,
        trigger,
        response,
        onlyOffline: onlyOffline !== undefined ? onlyOffline : true,
        isActive: true
      }
    });

    res.json(autoResponder);
  } catch (error) {
    console.error('Error creating auto-responder:', error);
    res.status(500).json({ error: 'Ошибка создания автоответчика' });
  }
});

// Update auto-responder
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const { trigger, response, isActive, onlyOffline } = req.body;
    const userId = req.userId!;

    // Check ownership
    const autoResponder = await prisma.autoResponder.findUnique({
      where: { id }
    });

    if (!autoResponder || autoResponder.userId !== userId) {
      return res.status(403).json({ error: 'Нет доступа к этому автоответчику' });
    }

    const updated = await prisma.autoResponder.update({
      where: { id },
      data: {
        ...(trigger && { trigger }),
        ...(response && { response }),
        ...(typeof isActive === 'boolean' && { isActive }),
        ...(typeof onlyOffline === 'boolean' && { onlyOffline })
      }
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating auto-responder:', error);
    res.status(500).json({ error: 'Ошибка обновления автоответчика' });
  }
});

// Delete auto-responder
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const userId = req.userId!;

    const autoResponder = await prisma.autoResponder.findUnique({
      where: { id }
    });

    if (!autoResponder || autoResponder.userId !== userId) {
      return res.status(403).json({ error: 'Нет доступа к этому автоответчику' });
    }

    await prisma.autoResponder.delete({
      where: { id }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting auto-responder:', error);
    res.status(500).json({ error: 'Ошибка удаления автоответчика' });
  }
});

export default router;
