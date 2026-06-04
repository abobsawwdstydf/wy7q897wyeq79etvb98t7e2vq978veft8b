import { Router } from 'express';
import { prisma } from '../db';
import { auth, AuthRequest } from '../middleware/auth';
import { getIO } from '../socket';

const router = Router();

// Получить активные аукционы
router.get('/', auth, async (req, res) => {
  try {
    const auctions = await prisma.nFTAuction.findMany({
      where: {
        status: 'ACTIVE',
        endsAt: { gt: new Date() }
      },
      include: {
        bids: {
          orderBy: { amount: 'desc' },
          take: 1
        }
      },
      orderBy: { endsAt: 'asc' }
    });

    // Подтягиваем инфу о пользователях, сделавших ставки
    const bidderIds = [...new Set(auctions.flatMap(a => a.bids.map(b => b.bidderId)))];
    const bidders = bidderIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: bidderIds } },
          select: { id: true, username: true, displayName: true, avatar: true }
        })
      : [];
    const userMap = new Map(bidders.map(u => [u.id, u]));

    const formatted = auctions.map(a => ({
      ...a,
      bids: a.bids.map(b => ({ ...b, user: userMap.get(b.bidderId) || null }))
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching auctions:', error);
    res.status(500).json({ error: 'Failed to fetch auctions' });
  }
});

// Создать аукцион
router.post('/', auth, async (req: AuthRequest, res) => {
  try {
    const { instanceId, startPrice, buyoutPrice, duration } = req.body;
    const userId = req.userId!;

    // Проверяем владение NFT
    const instance = await prisma.nFTInstance.findUnique({
      where: { id: instanceId }
    });

    if (!instance || instance.ownerId !== userId) {
      return res.status(403).json({ error: 'You do not own this NFT' });
    }

    if (instance.isEquipped) {
      return res.status(400).json({ error: 'Cannot auction equipped NFT' });
    }

    const endsAt = new Date(Date.now() + (duration || 24) * 60 * 60 * 1000);

    const auction = await prisma.nFTAuction.create({
      data: {
        instanceId,
        sellerId: userId,
        startPrice,
        currentPrice: startPrice,
        buyoutPrice,
        endsAt
      }
    });

    const io = getIO();
    io.emit('nft:auction_created', auction);

    res.json(auction);
  } catch (error) {
    console.error('Error creating auction:', error);
    res.status(500).json({ error: 'Failed to create auction' });
  }
});

// Сделать ставку
router.post('/:id/bid', auth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;
    const userId = req.userId!;

    const auction = await prisma.nFTAuction.findUnique({
      where: { id },
      include: { bids: { orderBy: { amount: 'desc' }, take: 1 } }
    });

    if (!auction || auction.status !== 'ACTIVE' || auction.endsAt < new Date()) {
      return res.status(400).json({ error: 'Auction not available' });
    }

    if (auction.sellerId === userId) {
      return res.status(400).json({ error: 'Cannot bid on your own auction' });
    }

    if (amount <= auction.currentPrice) {
      return res.status(400).json({ error: 'Bid must be higher than current price' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.beavers < amount) {
      return res.status(400).json({ error: 'Insufficient beavers' });
    }

    const bid = await prisma.nFTBid.create({
      data: { auctionId: id, bidderId: userId, amount }
    });

    await prisma.nFTAuction.update({
      where: { id },
      data: { currentPrice: amount }
    });

    const io = getIO();
    io.emit('nft:auction_new_bid', { auctionId: id, bid });

    res.json(bid);
  } catch (error) {
    console.error('Error placing bid:', error);
    res.status(500).json({ error: 'Failed to place bid' });
  }
});

// Выкупить сразу
router.post('/:id/buyout', auth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    const auction = await prisma.nFTAuction.findUnique({
      where: { id }
    });

    if (!auction || !auction.buyoutPrice || auction.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Buyout not available' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.beavers < auction.buyoutPrice) {
      return res.status(400).json({ error: 'Insufficient beavers' });
    }

    // Переводим бобры
    await prisma.user.update({
      where: { id: userId },
      data: { beavers: { decrement: auction.buyoutPrice } }
    });

    await prisma.user.update({
      where: { id: auction.sellerId },
      data: { beavers: { increment: auction.buyoutPrice } }
    });

    // Переводим NFT (auction.instanceId is just a field, no relation)
    await prisma.nFTInstance.update({
      where: { id: auction.instanceId },
      data: { ownerId: userId }
    });

    // Завершаем аукцион
    await prisma.nFTAuction.update({
      where: { id },
      data: { status: 'ENDED', winnerId: userId }
    });

    const io = getIO();
    io.emit('nft:auction_ended', { auctionId: id, winnerId: userId });

    res.json({ success: true });
  } catch (error) {
    console.error('Error buying out auction:', error);
    res.status(500).json({ error: 'Failed to buyout' });
  }
});

export default router;
