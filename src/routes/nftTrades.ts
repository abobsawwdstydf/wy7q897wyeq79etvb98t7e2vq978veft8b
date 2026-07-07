import { Router } from 'express';
import { prisma } from '../db';
import { auth, AuthRequest } from '../middleware/auth';
import { getIO } from '../socket';

const router = Router();

// Предложить обмен
router.post('/', auth, async (req: AuthRequest, res) => {
  try {
    const { recipientId, initiatorItems, recipientItems, initiatorBeavers, recipientBeavers } = req.body;
    const userId =   req.userId!;

    if (userId === recipientId) {
      return res.status(400).json({ error: 'Cannot trade with yourself' });
    }

    // Проверяем владение NFT
    if (initiatorItems && initiatorItems.length > 0) {
      const instances = await prisma.nFTInstance.findMany({
        where: { id: { in: initiatorItems }, ownerId: userId }
      });
      if (instances.length !== initiatorItems.length) {
        return res.status(403).json({ error: 'You do not own all specified NFTs' });
      }
    }

    const trade = await prisma.nFTTrade.create({
      data: {
        initiatorId: userId,
        recipientId,
        initiatorItems: JSON.stringify(initiatorItems || []),
        recipientItems: JSON.stringify(recipientItems || []),
        initiatorBeavers: initiatorBeavers || 0,
        recipientBeavers: recipientBeavers || 0
      }
    });

    const io = getIO();
    io.to(`user:${recipientId}`).emit('nft:trade_received', trade);

    res.json(trade);
  } catch (error) {
    console.error('Error creating trade:', error);
    res.status(500).json({ error: 'Failed to create trade' });
  }
});

// Получить мои обмены
router.get('/', auth, async (req: AuthRequest, res) => {
  try {
    const userId =   req.userId!;

    const trades = await prisma.nFTTrade.findMany({
      where: {
        OR: [
          { initiatorId: userId },
          { recipientId: userId }
        ]
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(trades);
  } catch (error) {
    console.error('Error fetching trades:', error);
    res.status(500).json({ error: 'Failed to fetch trades' });
  }
});

// Принять обмен
router.post('/:id/accept', auth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId =   req.userId!;

    const trade = await prisma.nFTTrade.findUnique({
      where: { id }
    });

    if (!trade || trade.recipientId !== userId || trade.status !== 'PENDING') {
      return res.status(400).json({ error: 'Invalid trade' });
    }

    const initiatorItems = JSON.parse(trade.initiatorItems);
    const recipientItems = JSON.parse(trade.recipientItems);

    // Проверяем балансы
    const initiator = await prisma.user.findUnique({ where: { id: trade.initiatorId } });
    const recipient = await prisma.user.findUnique({ where: { id: userId } });

    if (!initiator || !recipient) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (initiator.beavers < trade.initiatorBeavers || recipient.beavers < trade.recipientBeavers) {
      return res.status(400).json({ error: 'Insufficient beavers' });
    }

    // Выполняем обмен
    await prisma.$transaction(async (tx) => {
      // Переводим NFT
      if (initiatorItems.length > 0) {
        await tx.nFTInstance.updateMany({
          where: { id: { in: initiatorItems } },
          data: { ownerId: userId }
        });
      }

      if (recipientItems.length > 0) {
        await tx.nFTInstance.updateMany({
          where: { id: { in: recipientItems } },
          data: { ownerId: trade.initiatorId }
        });
      }

      // Переводим бобры
      if (trade.initiatorBeavers > 0) {
        await tx.user.update({
          where: { id: trade.initiatorId },
          data: { beavers: { decrement: trade.initiatorBeavers } }
        });
        await tx.user.update({
          where: { id: userId },
          data: { beavers: { increment: trade.initiatorBeavers } }
        });
      }

      if (trade.recipientBeavers > 0) {
        await tx.user.update({
          where: { id: userId },
          data: { beavers: { decrement: trade.recipientBeavers } }
        });
        await tx.user.update({
          where: { id: trade.initiatorId },
          data: { beavers: { increment: trade.recipientBeavers } }
        });
      }

      // Обновляем статус обмена
      await tx.nFTTrade.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date() }
      });
    });

    const io = getIO();
    io.to(`user:${trade.initiatorId}`).emit('nft:trade_accepted', { tradeId: id });

    res.json({ success: true });
  } catch (error) {
    console.error('Error accepting trade:', error);
    res.status(500).json({ error: 'Failed to accept trade' });
  }
});

// Отклонить обмен
router.post('/:id/decline', auth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId =   req.userId!;

    const trade = await prisma.nFTTrade.findUnique({
      where: { id }
    });

    if (!trade || trade.recipientId !== userId || trade.status !== 'PENDING') {
      return res.status(400).json({ error: 'Invalid trade' });
    }

    await prisma.nFTTrade.update({
      where: { id },
      data: { status: 'DECLINED' }
    });

    const io = getIO();
    io.to(`user:${trade.initiatorId}`).emit('nft:trade_declined', { tradeId: id });

    res.json({ success: true });
  } catch (error) {
    console.error('Error declining trade:', error);
    res.status(500).json({ error: 'Failed to decline trade' });
  }
});

// Отменить обмен
router.delete('/:id', auth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId =   req.userId!;

    const trade = await prisma.nFTTrade.findUnique({
      where: { id }
    });

    if (!trade || trade.initiatorId !== userId || trade.status !== 'PENDING') {
      return res.status(400).json({ error: 'Invalid trade' });
    }

    await prisma.nFTTrade.update({
      where: { id },
      data: { status: 'CANCELLED' }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error cancelling trade:', error);
    res.status(500).json({ error: 'Failed to cancel trade' });
  }
});

export default router;
