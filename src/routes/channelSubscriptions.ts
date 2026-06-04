import express from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();

// GET /api/channel-subscriptions/:channelId — get subscription info
router.get('/:channelId', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const channelId = String(req.params.channelId);

    const channel = await prisma.chat.findUnique({
      where: { id: channelId },
      select: { id: true, name: true, type: true },
    });

    if (!channel || channel.type !== 'channel') {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Get subscription price from channel settings (stored in customization)
    const customization = await prisma.chatCustomization.findUnique({
      where: { chatId: channelId },
    });

    const priceMonthly = customization?.customColor ? parseInt(customization.customColor, 10) || 0 : 0;

    // Check if user is subscribed
    const subscription = await prisma.channelSubscription.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });

    const isSubscribed = subscription ? new Date(subscription.expiresAt) > new Date() : false;

    res.json({
      channelId,
      priceMonthly,
      isSubscribed,
      expiresAt: subscription?.expiresAt || null,
      isFree: priceMonthly === 0,
    });
  } catch (error) {
    console.error('Get channel subscription error:', error);
    res.status(500).json({ error: 'Failed to get subscription info' });
  }
});

// POST /api/channel-subscriptions/:channelId/subscribe — subscribe to channel
router.post('/:channelId/subscribe', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const channelId = String(req.params.channelId);
    const { months = 1 } = req.body;

    const channel = await prisma.chat.findUnique({
      where: { id: channelId },
      select: { id: true, name: true, type: true },
    });

    if (!channel || channel.type !== 'channel') {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Get price
    const customization = await prisma.chatCustomization.findUnique({
      where: { chatId: channelId },
    });
    const priceMonthly = customization?.customColor ? parseInt(customization.customColor, 10) || 0 : 0;
    const totalCost = priceMonthly * months;

    if (totalCost > 0) {
      // Check user balance
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { beavers: true },
      });

      if (!user || user.beavers < totalCost) {
        return res.status(402).json({ error: 'Недостаточно бобров', required: totalCost, balance: user?.beavers || 0 });
      }

      // Deduct beavers
      await prisma.user.update({
        where: { id: userId },
        data: {
          beavers: { decrement: totalCost },
          totalSpent: { increment: totalCost },
        },
      });

      // Record transaction
      await prisma.transaction.create({
        data: {
          userId,
          amount: -totalCost,
          type: 'premium',
          description: `Подписка на канал ${channel.name} (${months} мес.)`,
          relatedId: channelId,
        },
      });
    }

    // Create/update subscription
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + months);

    const subscription = await prisma.channelSubscription.upsert({
      where: { channelId_userId: { channelId, userId } },
      create: { channelId, userId, priceMonthly, expiresAt },
      update: { expiresAt, priceMonthly },
    });

    // Add user to channel members if not already
    const existingMember = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: channelId, userId } },
    });

    if (!existingMember) {
      await prisma.chatMember.create({
        data: { chatId: channelId, userId, role: 'member' },
      });
    }

    res.json({ success: true, subscription, beaversSpent: totalCost });
  } catch (error) {
    console.error('Subscribe to channel error:', error);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// DELETE /api/channel-subscriptions/:channelId/unsubscribe
router.delete('/:channelId/unsubscribe', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const channelId = String(req.params.channelId);

    await prisma.channelSubscription.deleteMany({
      where: { channelId, userId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

// PUT /api/channel-subscriptions/:channelId/price — set subscription price (admin only)
router.put('/:channelId/price', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const channelId = String(req.params.channelId);
    const { priceMonthly } = req.body;

    if (typeof priceMonthly !== 'number' || priceMonthly < 0) {
      return res.status(400).json({ error: 'Invalid price' });
    }

    // Check if user is admin/owner
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: channelId, userId } },
    });

    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Only admins can set subscription price' });
    }

    // Store price in customization (using customColor field as price storage)
    await prisma.chatCustomization.upsert({
      where: { chatId: channelId },
      create: { chatId: channelId, userId, customColor: String(priceMonthly) },
      update: { customColor: String(priceMonthly) },
    });

    res.json({ success: true, priceMonthly });
  } catch (error) {
    console.error('Set subscription price error:', error);
    res.status(500).json({ error: 'Failed to set price' });
  }
});

export default router;
