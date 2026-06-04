import { Router } from 'express';
import { prisma } from '../db';
import { AuthRequest, authenticateToken } from '../middleware/auth';

const router = Router();

// Создать услугу
router.post('/services', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { title, description, category, price, deliveryTime, images } = req.body;

    if (!title || !description || !category || !price) {
      return res.status(400).json({ error: 'Заполните все обязательные поля' });
    }

    const service = await prisma.marketplaceService.create({
      data: {
        sellerId: userId,
        title,
        description,
        category,
        price,
        deliveryTime: deliveryTime || 1,
        images: JSON.stringify(images || [])
      }
    });

    const seller = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, displayName: true, avatar: true, isVerified: true }
    });

    res.json({ ...service, seller });
  } catch (error: any) {
    console.error('Error creating service:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить все услуги
router.get('/services', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { category, search, minPrice, maxPrice, sortBy = 'createdAt' } = req.query;

    const where: any = { isActive: true };

    if (category) {
      where.category = category as string;
    }

    if (search) {
      where.OR = [
        { title: { contains: search as string } },
        { description: { contains: search as string } }
      ];
    }

    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = parseInt(minPrice as string);
      if (maxPrice) where.price.lte = parseInt(maxPrice as string);
    }

    const services = await prisma.marketplaceService.findMany({
      where,
      orderBy: sortBy === 'price' ? { price: 'asc' } : { createdAt: 'desc' }
    });

    // Подтягиваем продавцов
    const sellerIds = [...new Set(services.map(s => s.sellerId))];
    const sellers = sellerIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: sellerIds } },
          select: { id: true, username: true, displayName: true, avatar: true, isVerified: true }
        })
      : [];
    const sellerMap = new Map(sellers.map(s => [s.id, s]));

    // Подтягиваем счётчики заказов и отзывов
    const serviceIds = services.map(s => s.id);
    const [orderCounts, reviewCounts] = serviceIds.length > 0
      ? await Promise.all([
          prisma.serviceOrder.groupBy({
            by: ['serviceId'],
            where: { serviceId: { in: serviceIds } },
            _count: { serviceId: true }
          }),
          prisma.serviceReview.groupBy({
            by: ['serviceId'],
            where: { serviceId: { in: serviceIds } },
            _count: { serviceId: true }
          })
        ])
      : [[], []];
    const orderMap = new Map((orderCounts as any[]).map(c => [c.serviceId, c._count.serviceId]));
    const reviewMap = new Map((reviewCounts as any[]).map(c => [c.serviceId, c._count.serviceId]));

    // Добавляем средний рейтинг
    const result = await Promise.all(services.map(async (service) => {
      const avgRating = await prisma.serviceReview.aggregate({
        where: { serviceId: service.id },
        _avg: { rating: true }
      });

      return {
        ...service,
        seller: sellerMap.get(service.sellerId) || null,
        averageRating: avgRating._avg.rating || 0,
        ordersCount: orderMap.get(service.id) || 0,
        reviewsCount: reviewMap.get(service.id) || 0
      };
    }));

    res.json(result);
  } catch (error: any) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить услугу
router.get('/services/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const service = await prisma.marketplaceService.findUnique({
      where: { id },
      include: {
        reviews: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!service) {
      return res.status(404).json({ error: 'Услуга не найдена' });
    }

    const seller = await prisma.user.findUnique({
      where: { id: service.sellerId },
      select: { id: true, username: true, displayName: true, avatar: true, isVerified: true }
    });

    // Подтягиваем покупателей для отзывов
    const buyerIds = [...new Set((service.reviews || []).map(r => r.buyerId))];
    const buyers = buyerIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: buyerIds } },
          select: { id: true, username: true, displayName: true, avatar: true }
        })
      : [];
    const buyerMap = new Map(buyers.map(b => [b.id, b]));

    const reviewsWithBuyers = (service.reviews || []).map(r => ({
      ...r,
      buyer: buyerMap.get(r.buyerId) || null
    }));

    const avgRating = await prisma.serviceReview.aggregate({
      where: { serviceId: id },
      _avg: { rating: true }
    });

    res.json({
      ...service,
      seller,
      reviews: reviewsWithBuyers,
      averageRating: avgRating._avg.rating || 0
    });
  } catch (error: any) {
    console.error('Error fetching service:', error);
    res.status(500).json({ error: error.message });
  }
});

// Создать заказ
router.post('/orders', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { serviceId, requirements } = req.body;

    if (!serviceId) {
      return res.status(400).json({ error: 'serviceId обязателен' });
    }

    const service = await prisma.marketplaceService.findUnique({
      where: { id: serviceId }
    });

    if (!service || !service.isActive) {
      return res.status(404).json({ error: 'Услуга не найдена' });
    }

    // Проверяем баланс
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || user.beavers < service.price) {
      return res.status(400).json({ error: 'Недостаточно бобров' });
    }

    // Создаём заказ (деньги в эскроу)
    const order = await prisma.serviceOrder.create({
      data: {
        serviceId,
        buyerId: userId,
        sellerId: service.sellerId,
        price: service.price,
        requirements,
        status: 'pending'
      },
      include: {
        service: true
      }
    });

    // Подтягиваем инфу о покупателе и продавце
    const [buyer, seller] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, displayName: true, avatar: true }
      }),
      prisma.user.findUnique({
        where: { id: service.sellerId },
        select: { id: true, username: true, displayName: true, avatar: true }
      })
    ]);

    // Замораживаем бобры
    await prisma.user.update({
      where: { id: userId },
      data: {
        beavers: { decrement: service.price }
      }
    });

    res.json({ ...order, buyer, seller });
  } catch (error: any) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: error.message });
  }
});

// Завершить заказ (покупатель подтверждает)
router.post('/orders/:id/complete', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const order = await prisma.serviceOrder.findUnique({
      where: { id }
    });

    if (!order) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    if (order.buyerId !== userId) {
      return res.status(403).json({ error: 'Нет прав' });
    }

    if (order.status !== 'in_progress') {
      return res.status(400).json({ error: 'Заказ не в работе' });
    }

    // Переводим деньги продавцу
    await prisma.user.update({
      where: { id: order.sellerId },
      data: {
        beavers: { increment: order.price },
        totalEarned: { increment: order.price }
      }
    });

    // Обновляем статус
    const updated = await prisma.serviceOrder.update({
      where: { id },
      data: {
        status: 'completed',
        completedAt: new Date()
      }
    });

    res.json(updated);
  } catch (error: any) {
    console.error('Error completing order:', error);
    res.status(500).json({ error: error.message });
  }
});

// Оставить отзыв
router.post('/reviews', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { serviceId, orderId, rating, comment } = req.body;

    if (!serviceId || !orderId || !rating) {
      return res.status(400).json({ error: 'Заполните все поля' });
    }

    // Проверяем, что заказ завершён и принадлежит пользователю
    const order = await prisma.serviceOrder.findUnique({
      where: { id: orderId }
    });

    if (!order || order.buyerId !== userId || order.status !== 'completed') {
      return res.status(400).json({ error: 'Невозможно оставить отзыв' });
    }

    const review = await prisma.serviceReview.create({
      data: {
        serviceId,
        orderId,
        buyerId: userId,
        rating,
        comment
      }
    });

    const buyer = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, displayName: true, avatar: true }
    });

    res.json({ ...review, buyer });
  } catch (error: any) {
    console.error('Error creating review:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить заказы пользователя
router.get('/orders/my', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { type = 'all' } = req.query;

    const where: any = {};

    if (type === 'buying') {
      where.buyerId = userId;
    } else if (type === 'selling') {
      where.sellerId = userId;
    } else {
      where.OR = [
        { buyerId: userId },
        { sellerId: userId }
      ];
    }

    const orders = await prisma.serviceOrder.findMany({
      where,
      include: {
        service: true
      },
      orderBy: { createdAt: 'desc' }
    });

    // Подтягиваем покупателей и продавцов
    const userIds = [...new Set(orders.flatMap(o => [o.buyerId, o.sellerId]))];
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, username: true, displayName: true, avatar: true }
        })
      : [];
    const userMap = new Map(users.map(u => [u.id, u]));

    res.json(orders.map(o => ({
      ...o,
      buyer: userMap.get(o.buyerId) || null,
      seller: userMap.get(o.sellerId) || null
    })));
  } catch (error: any) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
