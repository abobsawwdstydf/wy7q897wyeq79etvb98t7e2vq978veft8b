import { Router } from 'express';
import { prisma } from '../db';
import { auth, AuthRequest } from '../middleware/auth';
import { getIO } from '../socket';

const router = Router();

// Получить все коллекции
router.get('/', auth, async (req, res) => {
  try {
    const collections = await prisma.nFTCollection.findMany({
      orderBy: { createdAt: 'desc' }
    });

    // Подтягиваем карточки
    const collectionIds = collections.map(c => c.id);
    const cards = collectionIds.length > 0
      ? await prisma.nFTCard.findMany({
          where: { collectionId: { in: collectionIds } },
          select: { id: true, name: true, rarity: true, photoUrl: true, collectionId: true }
        })
      : [];

    const cardCounts = new Map<string, number>();
    for (const c of cards) {
      if (c.collectionId) {
        cardCounts.set(c.collectionId, (cardCounts.get(c.collectionId) || 0) + 1);
      }
    }

    res.json(collections.map(c => ({
      ...c,
      cards: cards.filter(card => card.collectionId === c.id),
      _count: { cards: cardCounts.get(c.id) || 0 }
    })));
  } catch (error) {
    console.error('Error fetching collections:', error);
    res.status(500).json({ error: 'Failed to fetch collections' });
  }
});

// Получить детали коллекции
router.get('/:id', auth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    const collection = await prisma.nFTCollection.findUnique({
      where: { id }
    });

    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    const cards = await prisma.nFTCard.findMany({
      where: { collectionId: id }
    });

    // Подтягиваем инстансы для текущего пользователя
    const cardIds = cards.map(c => c.id);
    const instances = cardIds.length > 0
      ? await prisma.nFTInstance.findMany({
          where: { cardId: { in: cardIds }, ownerId: userId },
          select: { id: true, serialNumber: true, cardId: true }
        })
      : [];

    const result = {
      ...collection,
      cards: cards.map(c => ({
        ...c,
        instances: instances.filter(i => i.cardId === c.id)
      }))
    };

    res.json(result);
  } catch (error) {
    console.error('Error fetching collection:', error);
    res.status(500).json({ error: 'Failed to fetch collection' });
  }
});

// Получить прогресс пользователя по коллекции
router.get('/:id/progress', auth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    const collection = await prisma.nFTCollection.findUnique({
      where: { id }
    });

    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    const cards = await prisma.nFTCard.findMany({
      where: { collectionId: id }
    });

    const cardIds = cards.map(c => c.id);
    const instances = cardIds.length > 0
      ? await prisma.nFTInstance.findMany({
          where: { cardId: { in: cardIds }, ownerId: userId },
          select: { id: true, cardId: true }
        })
      : [];

    // Подсчитываем прогресс
    const totalCards = cards.length;
    const ownedCardIds = new Set(instances.map(i => i.cardId));
    const ownedCards = ownedCardIds.size;
    const progress = totalCards > 0 ? (ownedCards / totalCards) * 100 : 0;
    const completed = ownedCards === totalCards && totalCards > 0;

    // Получаем или создаём запись прогресса
    const progressRecord = await prisma.collectionProgress.upsert({
      where: {
        userId_collectionId: {
          userId,
          collectionId: id
        }
      },
      create: {
        userId,
        collectionId: id,
        completed,
        completedAt: completed ? new Date() : null
      },
      update: {
        completed,
        completedAt: completed ? new Date() : undefined
      }
    });

    res.json({
      ...progressRecord,
      totalCards,
      ownedCards,
      progress,
      missingCards: cards.filter(card => !ownedCardIds.has(card.id))
    });
  } catch (error) {
    console.error('Error fetching collection progress:', error);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

// Получить награду за завершение коллекции
router.post('/:id/claim-reward', auth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    // Проверяем прогресс
    const collection = await prisma.nFTCollection.findUnique({
      where: { id }
    });

    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    const cards = await prisma.nFTCard.findMany({
      where: { collectionId: id }
    });
    const cardIds = cards.map(c => c.id);
    const instances = cardIds.length > 0
      ? await prisma.nFTInstance.findMany({
          where: { cardId: { in: cardIds }, ownerId: userId },
          select: { id: true, cardId: true }
        })
      : [];
    const ownedCardIds = new Set(instances.map(i => i.cardId));

    // Проверяем что все карточки собраны
    const allCollected = cards.length > 0 && cards.every(card => ownedCardIds.has(card.id));
    if (!allCollected) {
      return res.status(400).json({ error: 'Collection not completed' });
    }

    // Проверяем что награда ещё не получена
    const progress = await prisma.collectionProgress.findUnique({
      where: {
        userId_collectionId: {
          userId,
          collectionId: id
        }
      }
    });

    if (progress && progress.completed && progress.completedAt) {
      return res.status(400).json({ error: 'Reward already claimed' });
    }

    // Начисляем награду
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        beavers: {
          increment: collection.reward
        },
        totalEarned: {
          increment: collection.reward
        }
      }
    });

    // Обновляем прогресс
    await prisma.collectionProgress.upsert({
      where: {
        userId_collectionId: {
          userId,
          collectionId: id
        }
      },
      create: {
        userId,
        collectionId: id,
        completed: true,
        completedAt: new Date()
      },
      update: {
        completed: true,
        completedAt: new Date()
      }
    });

    // Создаём транзакцию
    await prisma.transaction.create({
      data: {
        userId,
        amount: collection.reward,
        type: 'collection_reward',
        description: `Награда за коллекцию "${collection.name}"`,
        relatedId: id
      }
    });

    // Отправляем Socket событие
    const io = getIO();
    io.to(`user:${userId}`).emit('collection:completed', {
      collection,
      reward: collection.reward
    });

    res.json({
      success: true,
      reward: collection.reward,
      newBalance: user.beavers
    });
  } catch (error) {
    console.error('Error claiming reward:', error);
    res.status(500).json({ error: 'Failed to claim reward' });
  }
});

// Создать коллекцию (только админ)
router.post('/', auth, async (req: AuthRequest, res) => {
  try {
    const { name, description, imageUrl, reward, cardIds } = req.body;
    const userId = req.userId!;

    // Проверяем права админа (можно добавить проверку роли)
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || !user.isVerified) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const collection = await prisma.nFTCollection.create({
      data: {
        name,
        description,
        imageUrl,
        reward: reward || 0
      }
    });

    // Привязываем карточки к коллекции
    if (cardIds && Array.isArray(cardIds)) {
      await prisma.nFTCard.updateMany({
        where: {
          id: { in: cardIds }
        },
        data: {
          collectionId: collection.id
        }
      });
    }

    res.json(collection);
  } catch (error) {
    console.error('Error creating collection:', error);
    res.status(500).json({ error: 'Failed to create collection' });
  }
});

export default router;
