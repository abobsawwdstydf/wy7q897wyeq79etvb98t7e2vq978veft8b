import { Router } from 'express';
import { prisma } from '../db';
import { auth, AuthRequest } from '../middleware/auth';
import { getIO } from '../socket';

const router = Router();

// Получить все анимации реакций
router.get('/animations', auth, async (req, res) => {
  try {
    const animations = await prisma.reactionAnimation.findMany();
    res.json(animations);
  } catch (error) {
    console.error('Error fetching reaction animations:', error);
    res.status(500).json({ error: 'Failed to fetch animations' });
  }
});

// Добавить реакцию к сообщению
router.post('/:messageId', auth, async (req: AuthRequest, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId =   req.userId!;

    // Проверяем существование сообщения
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: { chat: true }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Проверяем доступ к чату
    const member = await prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId: message.chatId,
          userId
        }
      }
    });

    if (!member) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Добавляем или обновляем реакцию
    const reaction = await prisma.reaction.upsert({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId,
          emoji
        }
      },
      create: {
        messageId,
        userId,
        emoji
      },
      update: {},
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true
          }
        }
      }
    });

    // Отправляем Socket событие
    const io = getIO();
    io.to(message.chatId).emit('message:reaction_added', {
      messageId,
      reaction: {
        ...reaction,
        user: reaction.user
      }
    });

    res.json(reaction);
  } catch (error) {
    console.error('Error adding reaction:', error);
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});

// Удалить реакцию
router.delete('/:messageId/:emoji', auth, async (req: AuthRequest, res) => {
  try {
    const { messageId, emoji } = req.params;
    const userId =   req.userId!;

    // Проверяем существование сообщения
    const message = await prisma.message.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Удаляем реакцию
    await prisma.reaction.delete({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId,
          emoji: decodeURIComponent(emoji)
        }
      }
    });

    // Отправляем Socket событие
    const io = getIO();
    io.to(message.chatId).emit('message:reaction_removed', {
      messageId,
      userId,
      emoji: decodeURIComponent(emoji)
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error removing reaction:', error);
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
});

// Получить реакции сообщения
router.get('/:messageId', auth, async (req: AuthRequest, res) => {
  try {
    const { messageId } = req.params;

    const reactions = await prisma.reaction.findMany({
      where: { messageId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Группируем по эмодзи
    const grouped = reactions.reduce((acc, reaction) => {
      if (!acc[reaction.emoji]) {
        acc[reaction.emoji] = [];
      }
      acc[reaction.emoji].push(reaction);
      return acc;
    }, {} as Record<string, typeof reactions>);

    res.json(grouped);
  } catch (error) {
    console.error('Error fetching reactions:', error);
    res.status(500).json({ error: 'Failed to fetch reactions' });
  }
});

export default router;
