import { Router } from 'express';
import { prisma } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Premium prices in beavers
const PREMIUM_PRICES = {
  '1month': 101,
  '3months': 270, // 10% discount
  '6months': 505, // 17% discount
  '12months': 970, // 20% discount
};

// Get premium status
router.get('/status', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: {
        isPremium: true,
        premiumUntil: true,
        premiumType: true,
        beavers: true,
      },
    });

    res.json(user);
  } catch (error) {
    console.error('Get premium status error:', error);
    res.status(500).json({ error: 'Failed to get premium status' });
  }
});

// Purchase premium
router.post('/purchase', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { months } = req.body;
    const userId = req.userId!;

    // Validate months
    const premiumType = `${months}month${months > 1 ? 's' : ''}` as keyof typeof PREMIUM_PRICES;
    const price = PREMIUM_PRICES[premiumType];

    if (!price) {
      return res.status(400).json({ error: 'Invalid premium duration' });
    }

    // Get user balance
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { beavers: true, isPremium: true, premiumUntil: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check balance
    if (user.beavers < price) {
      return res.status(400).json({ 
        error: 'Insufficient beavers',
        required: price,
        current: user.beavers,
      });
    }

    // Calculate expiration date
    const now = new Date();
    const currentExpiry = user.isPremium && user.premiumUntil && user.premiumUntil > now
      ? user.premiumUntil
      : now;
    
    const expiresAt = new Date(currentExpiry);
    expiresAt.setMonth(expiresAt.getMonth() + months);

    // Process purchase
    await prisma.$transaction([
      // Deduct beavers
      prisma.user.update({
        where: { id: userId },
        data: {
          beavers: { decrement: price },
          totalSpent: { increment: price },
          isPremium: true,
          premiumUntil: expiresAt,
          premiumType,
        },
      }),
      // Create transaction record
      prisma.transaction.create({
        data: {
          userId,
          amount: -price,
          type: 'premium',
          description: `Premium subscription: ${months} month${months > 1 ? 's' : ''}`,
        },
      }),
      // Create premium purchase record
      prisma.premiumPurchase.create({
        data: {
          userId,
          months,
          beavers: price,
          expiresAt,
        },
      }),
    ]);

    res.json({
      success: true,
      premiumUntil: expiresAt,
      beaversRemaining: user.beavers - price,
    });
  } catch (error) {
    console.error('Purchase premium error:', error);
    res.status(500).json({ error: 'Failed to purchase premium' });
  }
});

// Get premium prices
router.get('/prices', async (req, res) => {
  res.json(PREMIUM_PRICES);
});

// Gift premium to another user
router.post('/gift', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { username, period } = req.body;
    const senderId = req.userId!;

    if (!username || !period) {
      return res.status(400).json({ error: 'Username и период обязательны' });
    }

    // Find recipient
    const recipient = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true, beavers: true, isPremium: true, premiumUntil: true, displayName: true },
    });

    if (!recipient) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    if (recipient.id === senderId) {
      return res.status(400).json({ error: 'Нельзя подарить себе' });
    }

    // Calculate price (period in months)
    const months = Math.round(period * 4); // period is in weeks (0.25 = 1 week)
    const premiumType = months <= 1 ? '1month' : months <= 3 ? '3months' : months <= 6 ? '6months' : '12months';
    const price = PREMIUM_PRICES[premiumType as keyof typeof PREMIUM_PRICES] || PREMIUM_PRICES['1month'];

    // Get sender balance
    const sender = await prisma.user.findUnique({
      where: { id: senderId },
      select: { beavers: true, displayName: true },
    });

    if (!sender || sender.beavers < price) {
      return res.status(400).json({ 
        error: 'Недостаточно бобров',
        required: price,
        current: sender?.beavers || 0,
      });
    }

    // Calculate expiration for recipient
    const now = new Date();
    const currentExpiry = recipient.isPremium && recipient.premiumUntil && recipient.premiumUntil > now
      ? recipient.premiumUntil
      : now;
    const expiresAt = new Date(currentExpiry);
    expiresAt.setMonth(expiresAt.getMonth() + (months || 1));

    await prisma.$transaction([
      // Deduct from sender
      prisma.user.update({
        where: { id: senderId },
        data: { beavers: { decrement: price }, totalSpent: { increment: price } },
      }),
      // Give premium to recipient
      prisma.user.update({
        where: { id: recipient.id },
        data: { isPremium: true, premiumUntil: expiresAt, premiumType },
      }),
      // Transaction record
      prisma.transaction.create({
        data: {
          userId: senderId,
          amount: -price,
          type: 'premium',
          description: `Подарок Нексо НУче для @${username}`,
        },
      }),
    ]);

    res.json({ success: true, message: `Нексо НУче подарен пользователю @${username}` });
  } catch (error) {
    console.error('Gift premium error:', error);
    res.status(500).json({ error: 'Ошибка при подарке' });
  }
});

// Get purchase history
router.get('/history', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const purchases = await prisma.premiumPurchase.findMany({
      where: { userId: req.userId! },
      orderBy: { purchasedAt: 'desc' },
      take: 20,
    });

    res.json(purchases);
  } catch (error) {
    console.error('Get purchase history error:', error);
    res.status(500).json({ error: 'Failed to get purchase history' });
  }
});

export default router;
