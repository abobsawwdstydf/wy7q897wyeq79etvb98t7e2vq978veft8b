import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * Fake Password (Duress Account) feature.
 * When user logs in with fakePassword, they see only selected "safe" chats.
 * The real chats, wallet, and hidden content are not visible.
 */

// Set or update fake password
router.post('/set', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { fakePassword, fakeChats, currentPassword } = req.body;

    if (!currentPassword) {
      res.status(400).json({ error: 'Требуется текущий пароль для подтверждения' });
      return;
    }

    // Verify current password
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });

    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      res.status(400).json({ error: 'Неверный текущий пароль' });
      return;
    }

    if (fakePassword) {
      // Validate fake password strength (basic check)
      if (fakePassword.length < 6) {
        res.status(400).json({ error: 'Фейковый пароль должен содержать минимум 6 символов' });
        return;
      }

      // Ensure fake password != real password
      const sameAsReal = await bcrypt.compare(fakePassword, user.password);
      if (sameAsReal) {
        res.status(400).json({ error: 'Фейковый пароль не может совпадать с настоящим' });
        return;
      }

      const hashedFake = await bcrypt.hash(fakePassword, 10);
      await prisma.user.update({
        where: { id: userId },
        data: {
          fakePassword: hashedFake,
          fakeChats: JSON.stringify(fakeChats || []),
        },
      });
    } else {
      // Remove fake password
      await prisma.user.update({
        where: { id: userId },
        data: { fakePassword: null, fakeChats: '[]' },
      });
    }

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Get fake password settings (without exposing the hash)
router.get('/settings', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fakePassword: true, fakeChats: true },
    });

    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    res.json({
      hasFakePassword: !!user.fakePassword,
      fakeChats: user.fakeChats ? JSON.parse(user.fakeChats) : [],
    });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Update fake chats list
router.put('/fake-chats', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { fakeChats } = req.body;

    if (!Array.isArray(fakeChats)) {
      res.status(400).json({ error: 'fakeChats должен быть массивом' });
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: { fakeChats: JSON.stringify(fakeChats) },
    });

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
