import { Router } from 'express';
import { prisma } from '../db';
import { auth, AuthRequest } from '../middleware/auth';
import { getIO } from '../socket';

const router = Router();

// Preset статусы
const PRESET_STATUSES = [
  { emoji: '🎮', text: 'Играю' },
  { emoji: '💼', text: 'На работе' },
  { emoji: '🎓', text: 'Учусь' },
  { emoji: '😴', text: 'Сплю' },
  { emoji: '🍕', text: 'Обедаю' },
  { emoji: '🚗', text: 'В дороге' },
  { emoji: '🎬', text: 'Смотрю фильм' },
  { emoji: '🎵', text: 'Слушаю музыку' },
  { emoji: '💪', text: 'Тренируюсь' },
  { emoji: '🌴', text: 'В отпуске' },
  { emoji: '📚', text: 'Читаю' },
  { emoji: '🎨', text: 'Творю' },
  { emoji: '🛌', text: 'Отдыхаю' },
  { emoji: '🎉', text: 'Празднуюю' },
  { emoji: '🤔', text: 'Думаю' }
];

// Получить preset статусы
router.get('/presets', auth, async (req, res) => {
  res.json(PRESET_STATUSES);
});

// Получить статус пользователя
router.get('/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;

    const status = await prisma.userStatus.findUnique({
      where: { userId }
    });

    // Проверяем не истёк ли статус
    if (status && status.expiresAt && status.expiresAt < new Date()) {
      await prisma.userStatus.delete({
        where: { userId }
      });
      return res.json(null);
    }

    res.json(status);
  } catch (error) {
    console.error('Error fetching user status:', error);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// Установить статус
router.post('/', auth, async (req: AuthRequest, res) => {
  try {
    const { text, emoji, duration } = req.body; // duration в минутах
    const userId = req.userId!;

    if (!text || text.length > 100) {
      return res.status(400).json({ error: 'Invalid status text' });
    }

    let expiresAt: Date | null = null;
    if (duration && duration > 0) {
      expiresAt = new Date(Date.now() + duration * 60 * 1000);
    }

    const status = await prisma.userStatus.upsert({
      where: { userId },
      create: {
        userId,
        text,
        emoji: emoji || null,
        expiresAt
      },
      update: {
        text,
        emoji: emoji || null,
        expiresAt,
        updatedAt: new Date()
      }
    });

    // Отправляем Socket событие всем друзьям
    const io = getIO();
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { userId, status: 'accepted' },
          { friendId: userId, status: 'accepted' }
        ]
      }
    });

    const friendIds = friendships.map(f =>
      f.userId === userId ? f.friendId : f.userId
    );

    friendIds.forEach(friendId => {
      io.to(`user:${friendId}`).emit('user:status_changed', {
        userId,
        status
      });
    });

    res.json(status);
  } catch (error) {
    console.error('Error setting status:', error);
    res.status(500).json({ error: 'Failed to set status' });
  }
});

// Удалить статус
router.delete('/', auth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    await prisma.userStatus.delete({
      where: { userId }
    }).catch(() => {}); // Игнорируем если статуса нет

    // Отправляем Socket событие
    const io = getIO();
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { userId, status: 'accepted' },
          { friendId: userId, status: 'accepted' }
        ]
      }
    });

    const friendIds = friendships.map(f =>
      f.userId === userId ? f.friendId : f.userId
    );

    friendIds.forEach(friendId => {
      io.to(`user:${friendId}`).emit('user:status_changed', {
        userId,
        status: null
      });
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting status:', error);
    res.status(500).json({ error: 'Failed to delete status' });
  }
});

// Получить статусы друзей
router.get('/friends/all', auth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Получаем всех друзей
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { userId, status: 'accepted' },
          { friendId: userId, status: 'accepted' }
        ]
      }
    });

    const friendIds = friendships.map(f =>
      f.userId === userId ? f.friendId : f.userId
    );

    // Получаем статусы друзей
    const statuses = await prisma.userStatus.findMany({
      where: {
        userId: { in: friendIds },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      }
    });

    res.json(statuses);
  } catch (error) {
    console.error('Error fetching friend statuses:', error);
    res.status(500).json({ error: 'Failed to fetch statuses' });
  }
});

export default router;
