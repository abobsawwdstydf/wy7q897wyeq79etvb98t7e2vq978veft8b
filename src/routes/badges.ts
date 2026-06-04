import { Router } from 'express';
import { prisma } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Get all badge definitions
router.get('/definitions', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const badges = await prisma.badgeDefinition.findMany({
      orderBy: { conditionValue: 'asc' },
    });
    res.json({ badges });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Get user's badges
router.get('/user/:userId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const userBadges = await prisma.userBadge.findMany({
      where: { userId, isVisible: true },
      include: { badge: true },
      orderBy: { awardedAt: 'desc' },
    });
    res.json({ badges: userBadges });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Get my badges (including hidden)
router.get('/my', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userBadges = await prisma.userBadge.findMany({
      where: { userId: req.userId! },
      include: { badge: true },
      orderBy: { awardedAt: 'desc' },
    });
    res.json({ badges: userBadges });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Toggle badge visibility
router.put('/:badgeId/visibility', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { badgeId } = req.params;
    const { isVisible } = req.body;

    const userBadge = await prisma.userBadge.findUnique({
      where: { userId_badgeId: { userId: req.userId!, badgeId } },
    });

    if (!userBadge) {
      res.status(404).json({ error: 'Значок не найден' });
      return;
    }

    const updated = await prisma.userBadge.update({
      where: { userId_badgeId: { userId: req.userId!, badgeId } },
      data: { isVisible },
      include: { badge: true },
    });

    res.json({ badge: updated });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Check and award badges for a user (called after relevant actions)
router.post('/check', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const awarded = await checkAndAwardBadges(userId);
    res.json({ awarded });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export async function checkAndAwardBadges(userId: string): Promise<string[]> {
  const awarded: string[] = [];

  try {
    const [user, messageCount, friendCount, nftCount, definitions, existingBadges] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true, isPremium: true, isVerified: true, beavers: true } }),
      prisma.message.count({ where: { senderId: userId } }),
      prisma.friendship.count({ where: { userId, status: 'accepted' } }),
      prisma.nFTInstance.count({ where: { ownerId: userId } }),
      prisma.badgeDefinition.findMany({ where: { isAutomatic: true } }),
      prisma.userBadge.findMany({ where: { userId }, select: { badgeId: true } }),
    ]);

    if (!user) return awarded;

    const existingBadgeIds = new Set(existingBadges.map(b => b.badgeId));
    const accountAgeDays = Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24));

    const conditionValues: Record<string, number> = {
      messages_sent: messageCount,
      account_age_days: accountAgeDays,
      friends_count: friendCount,
      nft_count: nftCount,
      is_premium: user.isPremium ? 1 : 0,
      is_verified: user.isVerified ? 1 : 0,
      beavers: user.beavers,
    };

    for (const badge of definitions) {
      if (existingBadgeIds.has(badge.id)) continue;
      const value = conditionValues[badge.condition] ?? 0;
      if (value >= badge.conditionValue) {
        await prisma.userBadge.create({
          data: { userId, badgeId: badge.id },
        });
        awarded.push(badge.id);
      }
    }
  } catch (e) {
    console.error('[Badges] Error checking badges:', e);
  }

  return awarded;
}

export default router;
