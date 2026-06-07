import { Router } from 'express';
import { prisma } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Get all available premium effects
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { type, premiumOnly } = req.query;
    const where: any = { isActive: true };
    if (type) where.type = type;
    if (premiumOnly !== undefined) where.isPremiumOnly = premiumOnly === 'true';

    const effects = await prisma.premiumEffect.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    res.json(effects);
  } catch (error) {
    console.error('Get premium effects error:', error);
    res.status(500).json({ error: 'Failed to get effects' });
  }
});

// Get user's equipped effects
router.get('/equipped', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const userEffects = await prisma.userPremiumEffect.findMany({
      where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      include: { effect: true },
    });
    res.json(userEffects);
  } catch (error) {
    console.error('Get equipped effects error:', error);
    res.status(500).json({ error: 'Failed to get equipped effects' });
  }
});

// Purchase / unlock a premium effect
router.post('/:effectId/purchase', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { effectId } = req.params;

    const effect = await prisma.premiumEffect.findUnique({ where: { id: effectId } });
    if (!effect) return res.status(404).json({ error: 'Effect not found' });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { beavers: true, isPremium: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (effect.isPremiumOnly && !user.isPremium) {
      return res.status(403).json({ error: 'Only premium users can purchase this effect' });
    }

    if (effect.price > 0 && user.beavers < effect.price) {
      return res.status(400).json({ error: 'Insufficient beavers', required: effect.price, current: user.beavers });
    }

    const existing = await prisma.userPremiumEffect.findUnique({ where: { userId_effectId: { userId, effectId } } });
    if (existing) return res.status(400).json({ error: 'Effect already owned' });

    await prisma.$transaction([
      ...(effect.price > 0 ? [
        prisma.user.update({ where: { id: userId }, data: { beavers: { decrement: effect.price }, totalSpent: { increment: effect.price } } }),
        prisma.transaction.create({ data: { userId, amount: -effect.price, type: 'premium_effect', description: `Purchased effect: ${effect.name}` } }),
      ] : []),
      prisma.userPremiumEffect.create({ data: { userId, effectId } }),
    ]);

    res.json({ success: true, effect });
  } catch (error) {
    console.error('Purchase effect error:', error);
    res.status(500).json({ error: 'Failed to purchase effect' });
  }
});

// Equip / unequip an effect
router.post('/:effectId/equip', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { effectId } = req.params;
    const { equip } = req.body;

    const userEffect = await prisma.userPremiumEffect.findUnique({ where: { userId_effectId: { userId, effectId } } });
    if (!userEffect) return res.status(404).json({ error: 'Effect not owned' });

    if (equip) {
      // For avatar frames, set the user's avatar frame
      const effect = await prisma.premiumEffect.findUnique({ where: { id: effectId } });
      if (effect?.type === 'avatar_frame') {
        await prisma.userAvatarFrame.upsert({
          where: { userId },
          create: { userId, frameUrl: effect.url, frameType: effect.name },
          update: { frameUrl: effect.url, frameType: effect.name },
        });
      }
    }

    res.json({ success: true, equipped: equip });
  } catch (error) {
    console.error('Equip effect error:', error);
    res.status(500).json({ error: 'Failed to equip effect' });
  }
});

// Get user's avatar frame
router.get('/avatar-frame/:userId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const frame = await prisma.userAvatarFrame.findUnique({ where: { userId: req.params.userId } });
    res.json(frame || null);
  } catch (error) {
    console.error('Get avatar frame error:', error);
    res.status(500).json({ error: 'Failed to get frame' });
  }
});

// Admin: create premium effect
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { name, type, url, previewUrl, price, isPremiumOnly } = req.body;
    if (!name || !type || !url) return res.status(400).json({ error: 'name, type, url required' });

    const effect = await prisma.premiumEffect.create({
      data: { name, type, url, previewUrl, price: price || 0, isPremiumOnly: isPremiumOnly !== false },
    });
    res.json(effect);
  } catch (error) {
    console.error('Create effect error:', error);
    res.status(500).json({ error: 'Failed to create effect' });
  }
});

export default router;
