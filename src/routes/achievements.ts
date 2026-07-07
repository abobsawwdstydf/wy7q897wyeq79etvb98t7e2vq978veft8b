import { Router } from 'express';
import { prisma } from '../db';
import { auth, AuthRequest } from '../middleware/auth';
import { getIO } from '../socket';

const router = Router();

// Получить все достижения
router.get('/', auth, async (req, res) => {
  try {
    const achievements = await prisma.achievement.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(achievements);
  } catch (error) {
    console.error('Error fetching achievements:', error);
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

// Получить мои достижения
router.get('/my', auth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const userAchievements = await prisma.userAchievement.findMany({
      where: { userId },
      include: {
        achievement: true
      },
      orderBy: { completedAt: 'desc' }
    });

    res.json(userAchievements);
  } catch (error) {
    console.error('Error fetching user achievements:', error);
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

// Получить награду за достижение
router.post('/:id/claim', auth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    const userAchievement = await prisma.userAchievement.findUnique({
      where: {
        userId_achievementId: {
          userId,
          achievementId: id
        }
      },
      include: {
        achievement: true
      }
    });

    if (!userAchievement) {
      return res.status(404).json({ error: 'Achievement not found' });
    }

    if (!userAchievement.completed) {
      return res.status(400).json({ error: 'Achievement not completed' });
    }

    if (userAchievement.completedAt) {
      return res.status(400).json({ error: 'Reward already claimed' });
    }

    // Начисляем награду
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        beavers: {
          increment: userAchievement.achievement.reward
        },
        totalEarned: {
          increment: userAchievement.achievement.reward
        }
      }
    });

    // Обновляем достижение
    await prisma.userAchievement.update({
      where: {
        userId_achievementId: {
          userId,
          achievementId: id
        }
      },
      data: {
        completedAt: new Date()
      }
    });

    // Создаём транзакцию
    await prisma.transaction.create({
      data: {
        userId,
        amount: userAchievement.achievement.reward,
        type: 'achievement_reward',
        description: `Достижение: ${userAchievement.achievement.name}`,
        relatedId: id
      }
    });

    res.json({
      success: true,
      reward: userAchievement.achievement.reward,
      newBalance: user.beavers
    });
  } catch (error) {
    console.error('Error claiming achievement reward:', error);
    res.status(500).json({ error: 'Failed to claim reward' });
  }
});

// Проверить и обновить прогресс достижений (внутренняя функция)
export async function checkAchievements(userId: string, type: string) {
  try {
    const achievements = await prisma.achievement.findMany({
      where: { type: type as any }
    });

    for (const achievement of achievements) {
      let progress = 0;

      switch (type) {
        case 'COLLECT_CARDS': {
          const count = await prisma.nFTInstance.count({
            where: { ownerId: userId }
          });
          progress = count;
          break;
        }
        case 'COMPLETE_COLLECTION': {
          const count = await prisma.collectionProgress.count({
            where: { userId, completed: true }
          });
          progress = count;
          break;
        }
        case 'TRADE_COUNT': {
          const count = await prisma.nFTTrade.count({
            where: {
              OR: [
                { initiatorId: userId },
                { recipientId: userId }
              ],
              status: 'COMPLETED'
            }
          });
          progress = count;
          break;
        }
        case 'AUCTION_WIN': {
          const count = await prisma.nFTAuction.count({
            where: {
              winnerId: userId,
              status: 'ENDED'
            }
          });
          progress = count;
          break;
        }
      }

      const completed = progress >= achievement.requirement;

      // Обновляем или создаём запись
      const userAchievement = await prisma.userAchievement.upsert({
        where: {
          userId_achievementId: {
            userId,
            achievementId: achievement.id
          }
        },
        create: {
          userId,
          achievementId: achievement.id,
          progress,
          completed
        },
        update: {
          progress,
          completed
        }
      });

      // Если достижение только что завершено, отправляем уведомление
      if (completed && !userAchievement.completed) {
        const io = getIO();
        io.to(`user:${userId}`).emit('achievement:unlocked', {
          achievement,
          progress
        });
      }
    }
  } catch (error) {
    console.error('Error checking achievements:', error);
  }
}

export default router;
