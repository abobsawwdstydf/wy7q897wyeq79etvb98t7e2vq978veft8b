import { Router } from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Save voice transcript for a message
router.post('/:messageId', async (req: AuthRequest, res) => {
  try {
    const messageId = String(req.params.messageId);
    const userId = req.userId!;
    const { text, language, confidence } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text обязателен' });
    }

    // Verify user owns the message or is in the chat
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { senderId: true, chatId: true }
    });

    if (!message) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }

    if (message.senderId !== userId) {
      const member = await prisma.chatMember.findFirst({
        where: { chatId: message.chatId, userId }
      });
      if (!member) {
        return res.status(403).json({ error: 'Нет доступа' });
      }
    }

    const transcript = await prisma.voiceTranscript.upsert({
      where: { messageId },
      update: {
        text,
        language: language || 'ru',
        confidence: confidence || null,
      },
      create: {
        messageId,
        text,
        language: language || 'ru',
        confidence: confidence || null,
      }
    });

    res.json(transcript);
  } catch (error) {
    console.error('Save voice transcript error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Get voice transcript for a message
router.get('/:messageId', async (req: AuthRequest, res) => {
  try {
    const messageId = String(req.params.messageId);

    const transcript = await prisma.voiceTranscript.findUnique({
      where: { messageId }
    });

    if (!transcript) {
      return res.status(404).json({ error: 'Транскрипция не найдена' });
    }

    res.json(transcript);
  } catch (error) {
    console.error('Get voice transcript error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
