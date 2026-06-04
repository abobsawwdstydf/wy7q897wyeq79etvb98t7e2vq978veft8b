import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateTokenOrAdmin, AuthRequest } from '../middleware/auth';
import { getSocket } from '../socket';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { isValidAdminToken, sessions } from './admin';

const router = Router();
const prisma = new PrismaClient();

// Вспомогательная функция для проверки админ-прав
async function checkAdminAccess(req: AuthRequest): Promise<boolean> {
  console.log('[NFT] checkAdminAccess called:', {
    isAdmin: req.isAdmin,
    hasAdminToken: !!req.adminToken,
    hasUserId: !!req.userId,
    adminToken: req.adminToken ? req.adminToken.substring(0, 30) + '...' : 'none',
  });

  // If middleware set isAdmin flag and we have admin token
  if (req.isAdmin && req.adminToken) {
    // Проверяем, есть ли токен в сессиях
    const isValid = sessions.has(req.adminToken);
    console.log('[NFT] Admin token validation:', {
      token: req.adminToken.substring(0, 30) + '...',
      isValid,
      sessionsSize: sessions.size,
      sessionTokens: Array.from(sessions.keys()).map(t => t.substring(0, 30) + '...'),
    });
    
    // Если токен валидный - разрешаем доступ
    if (isValid) {
      return true;
    }
    
    // Если токен не в сессиях, но middleware установил isAdmin=true,
    // значит это может быть JWT токен админа - проверяем userId
    console.log('[NFT] Admin token not in sessions, checking userId...');
  }

  // If we have userId, check if user is admin
  if (req.userId) {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    // CRITICAL FIX: Use email field from database, not from JWT token
    // This prevents attackers from forging admin status via JWT
    const isAdmin = user ? user.email === 'admin@нексо.com' : false;
    console.log('[NFT] User admin check:', { userId: req.userId, isAdmin, email: user?.email });
    return isAdmin;
  }

  console.log('[NFT] No admin credentials found in request');
  return false;
}

// Настройка multer для загрузки NFT файлов
const nftStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.cwd(), 'uploads', 'nft');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `nft_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const nftUpload = multer({ storage: nftStorage, limits: { fileSize: 10 * 1024 * 1024 } });

// Загрузить файл (фото или эффект)
// Поддерживает как JWT токены, так и админ-токены
router.post('/upload', authenticateTokenOrAdmin, nftUpload.single('file') as any, async (req: any, res: any) => {
  try {
    const authReq = req as AuthRequest;

    console.log('[NFT Upload] Request received:', { 
      isAdmin: authReq.isAdmin,
      hasUserId: !!authReq.userId,
      hasAdminToken: !!authReq.adminToken,
      adminToken: authReq.adminToken ? authReq.adminToken.substring(0, 20) + '...' : 'none',
    });

    // Проверяем админ-права
    const isAdmin = await checkAdminAccess(authReq);
    console.log('[NFT Upload] Admin check result:', isAdmin);
    
    if (!isAdmin) {
      console.log('[NFT Upload] Admin access denied');
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (!req.file) {
      console.log('[NFT Upload] No file uploaded');
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const url = `/uploads/nft/${req.file.filename}`;
    console.log('[NFT Upload] File uploaded successfully:', url);
    res.json({ url });
  } catch (error) {
    console.error('[NFT Upload] Error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// ============================================
// NFT CARDS - Карточки
// ============================================

// Получить все карточки (для маркета) - доступно всем
router.get('/cards', async (req, res) => {
  try {
    const cards = await prisma.nFTCard.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(cards);
  } catch (error) {
    console.error('Error fetching NFT cards:', error);
    res.status(500).json({ error: 'Failed to fetch NFT cards' });
  }
});

// Получить карточку по ID - доступно всем
router.get('/cards/:id', async (req, res) => {
  try {
    const card = await prisma.nFTCard.findUnique({
      where: { id: String(req.params.id) },
      include: {
        instances: {
          take: 10,
          orderBy: { serialNumber: 'asc' },
        },
        priceHistory: {
          take: 30,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }
    
    res.json(card);
  } catch (error) {
    console.error('Error fetching NFT card:', error);
    res.status(500).json({ error: 'Failed to fetch NFT card' });
  }
});

// Создать карточку (только админ)
router.post('/cards', authenticateTokenOrAdmin, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const isAdmin = await checkAdminAccess(authReq);

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const {
      name,
      description,
      rarity,
      totalSupply,
      photoUrl,
      effectUrls,
      effectSettings,
      backgroundColor,
      gradientColors,
      borderColor,
      borderWidth,
      priceFromНексо,
      isStockEnabled,
      stockVolatility,
    } = req.body;
    
    // Создаём карточку и листинг в одной транзакции
    const result = await prisma.$transaction(async (tx) => {
      const card = await tx.nFTCard.create({
        data: {
          name,
          description,
          rarity,
          totalSupply,
          photoUrl,
          effectUrls: JSON.stringify(effectUrls || []),
          effectSettings: JSON.stringify(effectSettings || {}),
          backgroundColor,
          gradientColors: gradientColors ? JSON.stringify(gradientColors) : null,
          borderColor,
          borderWidth: borderWidth || 0,
          priceFromНексо: priceFromНексо || 0,
          currentPrice: priceFromНексо || 0,
          isStockEnabled: isStockEnabled || false,
          stockVolatility: stockVolatility || 5,
        },
      });
      
      // ВСЕГДА создаём листинг "От Нексо" (даже если цена 0)
      let listing = null;
      // Получаем ID админа
      const adminUser = await tx.user.findFirst({
        where: { email: 'admin@нексо.com' },
      });
      
      if (adminUser) {
        listing = await tx.nFTMarketListing.create({
          data: {
            cardId: card.id,
            sellerId: adminUser.id,
            price: priceFromНексо || 0,
            isFromНексо: true,
          },
        });
        console.log('[NFT] Auto-created market listing for card:', card.name, 'Price:', priceFromНексо || 0);
      }
      
      return { card, listing };
    });
    
    console.log('[NFT] Card created:', result.card.name, 'Listing:', result.listing ? 'created' : 'skipped');
    res.json(result.card);
  } catch (error) {
    console.error('Error creating NFT card:', error);
    res.status(500).json({ error: 'Failed to create NFT card' });
  }
});

// Обновить карточку (только админ)
router.put('/cards/:id', authenticateTokenOrAdmin, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const isAdmin = await checkAdminAccess(authReq);

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const cardId = String(req.params.id);
    
    // CRITICAL FIX: Validate and sanitize input to prevent SQL injection
    const allowedFields = [
      'name', 'description', 'rarity', 'totalSupply', 'photoUrl',
      'effectUrls', 'effectSettings', 'backgroundColor', 'gradientColors',
      'borderColor', 'borderWidth', 'priceFromНексо', 'isStockEnabled',
      'stockVolatility', 'currentPrice', 'lastPriceUpdate'
    ];
    
    const updateData: any = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        updateData[key] = req.body[key];
      }
    }
    
    // Validate numeric fields
    if (updateData.totalSupply !== undefined) {
      updateData.totalSupply = Math.max(1, Math.min(1000000, parseInt(updateData.totalSupply) || 1));
    }
    if (updateData.priceFromНексо !== undefined) {
      updateData.priceFromНексо = Math.max(0, Math.min(1000000, parseInt(updateData.priceFromНексо) || 0));
    }
    if (updateData.currentPrice !== undefined) {
      updateData.currentPrice = Math.max(1, Math.min(1000000, parseInt(updateData.currentPrice) || 1));
    }
    if (updateData.stockVolatility !== undefined) {
      updateData.stockVolatility = Math.max(0.1, Math.min(50, parseFloat(updateData.stockVolatility) || 5));
    }
    if (updateData.borderWidth !== undefined) {
      updateData.borderWidth = Math.max(0, Math.min(100, parseInt(updateData.borderWidth) || 0));
    }
    
    const card = await prisma.nFTCard.update({
      where: { id: cardId },
      data: updateData,
    });
    
    res.json(card);
  } catch (error) {
    console.error('Error updating NFT card:', error);
    res.status(500).json({ error: 'Failed to update NFT card' });
  }
});

// Удалить карточку (только админ)
router.delete('/cards/:id', authenticateTokenOrAdmin, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const isAdmin = await checkAdminAccess(authReq);

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    await prisma.nFTCard.delete({ where: { id: String(req.params.id) } });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting NFT card:', error);
    res.status(500).json({ error: 'Failed to delete NFT card' });
  }
});

// ============================================
// NFT INSTANCES - Инвентарь пользователя
// ============================================

// Получить инвентарь пользователя
router.get('/inventory', authenticateTokenOrAdmin, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    
    if (!authReq.userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    
    const cards = await prisma.nFTInstance.findMany({
      where: { ownerId: authReq.userId },
      include: {
        card: true,
        giftHistory: {
          orderBy: { giftedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { receivedAt: 'desc' },
    });
    
    const tags = await prisma.nFTTagInstance.findMany({
      where: { ownerId: authReq.userId },
      include: {
        tag: true,
      },
      orderBy: { receivedAt: 'desc' },
    });
    
    res.json({ cards, tags });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// Надеть карточку
router.post('/instances/:id/equip', authenticateTokenOrAdmin, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    
    if (!authReq.userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    
    const instanceId = String(req.params.id);
    
    // Снять все другие карточки
    await prisma.nFTInstance.updateMany({
      where: { ownerId: authReq.userId, isEquipped: true },
      data: { isEquipped: false },
    });
    
    // Надеть выбранную
    const updatedCount = await prisma.nFTInstance.updateMany({
      where: { id: instanceId, ownerId: authReq.userId },
      data: { isEquipped: true },
    });
    if (updatedCount.count === 0) {
      return res.status(404).json({ error: 'NFT instance not found' });
    }
    const instance = await prisma.nFTInstance.findUnique({
      where: { id: instanceId },
      include: { card: true },
    });
    if (!instance) {
      return res.status(404).json({ error: 'NFT instance not found' });
    }
    
    // Записать транзакцию
    await prisma.nFTTransaction.create({
      data: {
        type: 'equip',
        itemType: 'card',
        itemId: instance.cardId,
        userId: authReq.userId,
      },
    });
    
    res.json(instance);
  } catch (error) {
    console.error('Error equipping NFT:', error);
    res.status(500).json({ error: 'Failed to equip NFT' });
  }
});

// Снять карточку
router.post('/instances/:id/unequip', authenticateTokenOrAdmin, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    
    if (!authReq.userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    
    const instanceId = String(req.params.id);
    
    const updatedCount = await prisma.nFTInstance.updateMany({
      where: { id: instanceId, ownerId: authReq.userId },
      data: { isEquipped: false },
    });
    if (updatedCount.count === 0) {
      return res.status(404).json({ error: 'NFT instance not found' });
    }
    const instance = await prisma.nFTInstance.findUnique({
      where: { id: instanceId },
      include: { card: true },
    });
    if (!instance) {
      return res.status(404).json({ error: 'NFT instance not found' });
    }
    
    await prisma.nFTTransaction.create({
      data: {
        type: 'unequip',
        itemType: 'card',
        itemId: instance.cardId,
        userId: authReq.userId,
      },
    });
    
    res.json(instance);
  } catch (error) {
    console.error('Error unequipping NFT:', error);
    res.status(500).json({ error: 'Failed to unequip NFT' });
  }
});

// Подарить карточку
router.post('/instances/:id/gift', authenticateTokenOrAdmin, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    
    if (!authReq.userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    
    const instanceId = String(req.params.id);
    const { toUserId, message } = req.body;
    
    if (!toUserId) {
      return res.status(400).json({ error: 'Recipient user ID required' });
    }
    
    // CRITICAL FIX: Prevent self-gifting
    if (toUserId === authReq.userId) {
      return res.status(400).json({ error: 'Нельзя подарить NFT самому себе' });
    }
    
    // Проверить владение
    const instance = await prisma.nFTInstance.findUnique({
      where: { id: instanceId },
      include: { card: true },
    });
    
    if (!instance || instance.ownerId !== authReq.userId) {
      return res.status(403).json({ error: 'You do not own this NFT' });
    }
    
    // Передать карточку
    const updated = await prisma.nFTInstance.update({
      where: { id: instanceId },
      data: {
        ownerId: toUserId,
        isEquipped: false,
        receivedFrom: authReq.userId,
        receivedMessage: message,
        receivedAt: new Date(),
      },
    });
    
    // Записать в историю
    await prisma.nFTGiftHistory.create({
      data: {
        instanceId,
        fromUserId: authReq.userId,
        toUserId,
        message,
      },
    });
    
    await prisma.nFTTransaction.create({
      data: {
        type: 'gift',
        itemType: 'card',
        itemId: instance.cardId,
        userId: authReq.userId,
        details: JSON.stringify({ toUserId, message }),
      },
    });
    
    // Отправить Socket уведомление получателю
    const io = getSocket();
    if (io) {
      io.to(`user:${toUserId}`).emit('nft:gift_received', {
        fromUserId: authReq.userId,
        cardName: instance.card.name,
        message: message || 'Подарок для тебя! 🎁',
        instanceId,
        photoUrl: instance.card.photoUrl,
        effectUrls: instance.card.effectUrls,
        backgroundColor: instance.card.backgroundColor,
        gradientColors: instance.card.gradientColors,
        borderColor: instance.card.borderColor,
        borderWidth: instance.card.borderWidth,
        rarity: instance.card.rarity,
      });
    }
    
    res.json(updated);
  } catch (error) {
    console.error('Error gifting NFT:', error);
    res.status(500).json({ error: 'Failed to gift NFT' });
  }
});

// ============================================
// NFT MARKET - Маркетплейс
// ============================================

// Получить все объявления (доступно всем)
router.get('/market', async (req, res) => {
  try {
    const {
      search,
      seller,
      minPrice,
      maxPrice,
      rarity,
      verified,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      isFromНексо,
    } = req.query;
    
    const where: any = {};
    
    // Фильтры
    if (isFromНексо !== undefined) {
      where.isFromНексо = isFromНексо === 'true';
    }
    
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = parseInt(minPrice as string);
      if (maxPrice) where.price.lte = parseInt(maxPrice as string);
    }
    
    if (seller) {
      where.sellerId = seller;
    }
    
    const listings = await prisma.nFTMarketListing.findMany({
      where,
      include: {
        card: true,
      },
      orderBy: { [sortBy as string]: sortOrder },
    });
    
    // Дополнительные фильтры (поиск, редкость)
    let filtered = listings;
    
    if (search) {
      const searchLower = (search as string).toLowerCase();
      filtered = filtered.filter(l => 
        l.card.name.toLowerCase().includes(searchLower)
      );
    }
    
    if (rarity) {
      filtered = filtered.filter(l => l.card.rarity === rarity);
    }
    
    // Фильтр верификации продавца
    if (verified === 'verified') {
      const sellers = await prisma.user.findMany({
        where: { id: { in: filtered.map(l => l.sellerId) }, isVerified: true },
      });
      const verifiedIds = new Set(sellers.map(s => s.id));
      filtered = filtered.filter(l => verifiedIds.has(l.sellerId));
    } else if (verified === 'unverified') {
      const sellers = await prisma.user.findMany({
        where: { id: { in: filtered.map(l => l.sellerId) }, isVerified: false },
      });
      const unverifiedIds = new Set(sellers.map(s => s.id));
      filtered = filtered.filter(l => unverifiedIds.has(l.sellerId));
    }
    
    res.json(filtered);
  } catch (error) {
    console.error('Error fetching market listings:', error);
    res.status(500).json({ error: 'Failed to fetch market listings' });
  }
});

// Выставить на продажу
router.post('/market/list', authenticateTokenOrAdmin, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    
    if (!authReq.userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    
    const { instanceId, price } = req.body;
    
    if (!instanceId || !price) {
      return res.status(400).json({ error: 'Instance ID and price required' });
    }
    
    // Проверить владение
    const instance = await prisma.nFTInstance.findUnique({
      where: { id: instanceId },
    });
    
    if (!instance || instance.ownerId !== authReq.userId) {
      return res.status(403).json({ error: 'You do not own this NFT' });
    }
    
    // Проверить лимит цены для P2P
    const user = await prisma.user.findUnique({ where: { id: authReq.userId } });
    const isAdmin = user?.email === 'admin@нексо.com';
    
    if (!isAdmin && price > 1000) {
      return res.status(400).json({ error: 'P2P listings limited to 1000 beavers' });
    }
    
    // Создать объявление
    const listing = await prisma.nFTMarketListing.create({
      data: {
        cardId: instance.cardId,
        instanceId,
        sellerId: authReq.userId,
        price,
        isFromНексо: isAdmin,
      },
      include: { card: true },
    });
    
    res.json(listing);
  } catch (error) {
    console.error('Error listing NFT:', error);
    res.status(500).json({ error: 'Failed to list NFT' });
  }
});

// Купить NFT
router.post('/market/:listingId/buy', authenticateTokenOrAdmin, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    
    if (!authReq.userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    
    const listingId = String(req.params.listingId);
    
    // CRITICAL FIX: Use transaction with FOR UPDATE lock to prevent race conditions
    const listing = await prisma.$transaction(async (tx) => {
      const lockedListing = await tx.nFTMarketListing.findUnique({
        where: { id: listingId },
        include: { card: true },
      });
      
      if (!lockedListing) {
        throw new Error('Listing not found');
      }
      
      // Проверить баланс
      const buyer = await tx.user.findUnique({ 
        where: { id: authReq.userId },
        select: { beavers: true, username: true },
      });
      
      if (!buyer || buyer.beavers < lockedListing.price) {
        throw new Error('Insufficient beavers');
      }
      
      // Если от Нексо - создать новый экземпляр
      if (lockedListing.isFromНексо) {
        // Проверить тираж
        if (lockedListing.card.currentSupply >= lockedListing.card.totalSupply) {
          throw new Error('Sold out');
        }
        
        const serialNumber = lockedListing.card.currentSupply + 1;
        
        // Создать экземпляр
        const instance = await tx.nFTInstance.create({
          data: {
            cardId: lockedListing.cardId!,
            ownerId: authReq.userId!,
            serialNumber,
            purchasePrice: lockedListing.price,
          },
        });
        
        // Обновить тираж
        await tx.nFTCard.update({
          where: { id: lockedListing.cardId },
          data: { currentSupply: { increment: 1 } },
        });
        
        // Списать бобров
        await tx.user.update({
          where: { id: authReq.userId },
          data: {
            beavers: { decrement: lockedListing.price },
            totalSpent: { increment: lockedListing.price },
          },
        });
        
        // Удалить объявление если тираж закончился
        if (serialNumber >= lockedListing.card.totalSupply) {
          await tx.nFTMarketListing.delete({ where: { id: listingId } });
        }
        
        await tx.nFTTransaction.create({
          data: {
            type: 'purchase',
            itemType: 'card',
            itemId: lockedListing.cardId!,
            userId: authReq.userId!,
            amount: lockedListing.price,
          },
        });
        
        // Получить обновлённый баланс
        const updatedBuyer = await tx.user.findUnique({
          where: { id: authReq.userId },
          select: { beavers: true, totalSpent: true, totalEarned: true },
        });
        
        return { instance, listing: lockedListing, newBalance: updatedBuyer?.beavers || 0 };
      }
      
      // P2P покупка
      if (!lockedListing.instanceId) {
        throw new Error('Invalid listing instance');
      }

      const instance = await tx.nFTInstance.update({
        where: { id: lockedListing.instanceId },
        data: {
          ownerId: authReq.userId,
          isEquipped: false,
          purchasePrice: lockedListing.price,
          receivedAt: new Date(),
        },
      });
      
      // Перевести бобров продавцу
      await tx.user.update({
        where: { id: lockedListing.sellerId },
        data: {
          beavers: { increment: lockedListing.price },
          totalEarned: { increment: lockedListing.price },
        },
      });
      
      // Списать у покупателя
      await tx.user.update({
        where: { id: authReq.userId },
        data: {
          beavers: { decrement: lockedListing.price },
          totalSpent: { increment: lockedListing.price },
        },
      });
      
      // Удалить объявление
      await tx.nFTMarketListing.delete({ where: { id: listingId } });
      
      // Записать транзакции
      await tx.nFTTransaction.createMany({
        data: [
          {
            type: 'purchase',
            itemType: 'card',
            itemId: lockedListing.cardId!,
            userId: authReq.userId!,
            amount: lockedListing.price,
          },
          {
            type: 'sale',
            itemType: 'card',
            itemId: lockedListing.cardId,
            userId: lockedListing.sellerId,
            amount: lockedListing.price,
          },
        ],
      });
      
      // Отправить Socket уведомление продавцу
      const io = getSocket();
      if (io) {
        const card = await tx.nFTCard.findUnique({ where: { id: lockedListing.cardId } });
        if (card) {
          io.to(`user:${lockedListing.sellerId}`).emit('nft:sold', {
            cardName: card.name,
            price: lockedListing.price,
            buyerId: authReq.userId,
          });
        }
      }
      
      // Получить обновлённый баланс
      const updatedBuyer = await tx.user.findUnique({
        where: { id: authReq.userId },
        select: { beavers: true, totalSpent: true, totalEarned: true },
      });
      
      return { instance, listing: lockedListing, newBalance: updatedBuyer?.beavers || 0 };
    });
    
    res.json(listing);
  } catch (error: any) {
    console.error('Error buying NFT:', error);
    res.status(500).json({ error: error.message || 'Failed to buy NFT' });
  }
});

// Снять с продажи
router.delete('/market/:listingId', authenticateTokenOrAdmin, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    
    if (!authReq.userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    
    const listingId = String(req.params.listingId);
    
    const listing = await prisma.nFTMarketListing.findUnique({
      where: { id: listingId },
    });
    
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    
    if (listing.sellerId !== authReq.userId) {
      return res.status(403).json({ error: 'Not your listing' });
    }
    
    await prisma.nFTMarketListing.delete({ where: { id: listingId } });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting listing:', error);
    res.status(500).json({ error: 'Failed to delete listing' });
  }
});

// ============================================
// STOCK SYSTEM - Акции (динамические цены)
// ============================================

// Обновить цены акций (cron job)
router.post('/stock/update', async (req, res) => {
  try {
    const cards = await prisma.nFTCard.findMany({
      where: { isStockEnabled: true },
    });
    
    for (const card of cards) {
      // Случайное изменение ±volatility%
      const change = (Math.random() - 0.5) * 2 * card.stockVolatility;
      
      // Учесть продажи за последние 24 часа
      const recentSales = await prisma.nFTTransaction.count({
        where: {
          itemId: card.id,
          type: 'purchase',
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });
      
      const salesBoost = recentSales * 10; // +10% за каждую продажу
      
      // Проверить последнюю продажу
      const lastSale = await prisma.nFTTransaction.findFirst({
        where: { itemId: card.id, type: 'purchase' },
        orderBy: { createdAt: 'desc' },
      });
      
      let inactivityPenalty = 0;
      if (lastSale) {
        const daysSinceLastSale = (Date.now() - lastSale.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceLastSale >= 3) {
          inactivityPenalty = -3; // -3% если не покупали 3 дня
        }
      }
      
      const totalChange = change + salesBoost + inactivityPenalty;
      const newPrice = Math.max(1, Math.round(card.currentPrice * (1 + totalChange / 100)));
      
      await prisma.nFTCard.update({
        where: { id: card.id },
        data: {
          currentPrice: newPrice,
          lastPriceUpdate: new Date(),
        },
      });
      
      // Записать в историю
      await prisma.nFTPriceHistory.create({
        data: {
          cardId: card.id,
          price: newPrice,
          change: totalChange,
          reason: 'stock_update',
        },
      });
    }
    
    res.json({ success: true, updated: cards.length });
  } catch (error) {
    console.error('Error updating stock prices:', error);
    res.status(500).json({ error: 'Failed to update stock prices' });
  }
});

// Получить историю цен - доступно всем
router.get('/cards/:id/price-history', async (req, res) => {
  try {
    const history = await prisma.nFTPriceHistory.findMany({
      where: { cardId: String(req.params.id) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    
    res.json(history);
  } catch (error) {
    console.error('Error fetching price history:', error);
    res.status(500).json({ error: 'Failed to fetch price history' });
  }
});

// Получить историю цен тегов - доступно всем
router.get('/tags/:id/price-history', async (req, res) => {
  try {
    const history = await prisma.nFTTagPriceHistory.findMany({
      where: { tagId: String(req.params.id) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    
    res.json(history);
  } catch (error) {
    console.error('Error fetching tag price history:', error);
    res.status(500).json({ error: 'Failed to fetch tag price history' });
  }
});

// ============================================
// NFT TAGS - Теги/нашивки
// ============================================

// Получить все теги - доступно всем
router.get('/tags', async (req, res) => {
  try {
    const tags = await prisma.nFTTag.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(tags);
  } catch (error) {
    console.error('Error fetching NFT tags:', error);
    res.status(500).json({ error: 'Failed to fetch NFT tags' });
  }
});

// Получить тег по ID - доступно всем
router.get('/tags/:id', async (req, res) => {
  try {
    const tag = await prisma.nFTTag.findUnique({
      where: { id: String(req.params.id) },
      include: {
        instances: {
          take: 10,
          orderBy: { serialNumber: 'asc' },
        },
        priceHistory: {
          take: 30,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    
    if (!tag) {
      return res.status(404).json({ error: 'Tag not found' });
    }
    
    res.json(tag);
  } catch (error) {
    console.error('Error fetching NFT tag:', error);
    res.status(500).json({ error: 'Failed to fetch NFT tag' });
  }
});

// Создать тег (только админ)
router.post('/tags', authenticateTokenOrAdmin, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const isAdmin = await checkAdminAccess(authReq);

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Создаём тег и листинг в одной транзакции
    const result = await prisma.$transaction(async (tx) => {
      const tag = await tx.nFTTag.create({
        data: {
          ...req.body,
          currentPrice: req.body.priceFromНексо || 0,
        },
      });
      
      // ВСЕГДА создаём листинг "От Нексо" (даже если цена 0)
      let listing = null;
      const adminUser = await tx.user.findFirst({
        where: { email: 'admin@нексо.com' },
      });
      
      if (adminUser) {
        listing = await tx.nFTTagMarketListing.create({
          data: {
            tagId: tag.id,
            sellerId: adminUser.id,
            price: req.body.priceFromНексо || 0,
            isFromНексо: true,
          },
        });
        console.log('[NFT] Auto-created tag market listing for:', tag.name, 'Price:', req.body.priceFromНексо || 0);
      }
      
      return { tag, listing };
    });
    
    console.log('[NFT] Tag created:', result.tag.name, 'Listing:', result.listing ? 'created' : 'skipped');
    res.json(result.tag);
  } catch (error) {
    console.error('Error creating NFT tag:', error);
    res.status(500).json({ error: 'Failed to create NFT tag' });
  }
});

// Надеть тег
router.post('/tag-instances/:id/equip', authenticateTokenOrAdmin, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    
    if (!authReq.userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    
    const instanceId = String(req.params.id);
    const { slot } = req.body; // 1 или 2
    
    if (!slot || (slot !== 1 && slot !== 2)) {
      return res.status(400).json({ error: 'Slot must be 1 or 2' });
    }
    
    // Снять тег из этого слота
    await prisma.nFTTagInstance.updateMany({
      where: { ownerId: authReq.userId, slot },
      data: { isEquipped: false, slot: null },
    });
    
    // Надеть новый
    const updatedCount = await prisma.nFTTagInstance.updateMany({
      where: { id: instanceId, ownerId: authReq.userId },
      data: { isEquipped: true, slot },
    });
    if (updatedCount.count === 0) {
      return res.status(404).json({ error: 'Tag instance not found' });
    }
    const instance = await prisma.nFTTagInstance.findUnique({
      where: { id: instanceId },
      include: { tag: true },
    });
    if (!instance) {
      return res.status(404).json({ error: 'Tag instance not found' });
    }
    
    res.json(instance);
  } catch (error) {
    console.error('Error equipping tag:', error);
    res.status(500).json({ error: 'Failed to equip tag' });
  }
});

// Снять тег
router.post('/tag-instances/:id/unequip', authenticateTokenOrAdmin, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    
    if (!authReq.userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    
    const instanceId = String(req.params.id);
    
    const updatedCount = await prisma.nFTTagInstance.updateMany({
      where: { id: instanceId, ownerId: authReq.userId },
      data: { isEquipped: false, slot: null },
    });
    if (updatedCount.count === 0) {
      return res.status(404).json({ error: 'Tag instance not found' });
    }
    const instance = await prisma.nFTTagInstance.findUnique({
      where: { id: instanceId },
      include: { tag: true },
    });
    if (!instance) {
      return res.status(404).json({ error: 'Tag instance not found' });
    }
    
    res.json(instance);
  } catch (error) {
    console.error('Error unequipping tag:', error);
    res.status(500).json({ error: 'Failed to unequip tag' });
  }
});

// Выставить тег на продажу
router.post('/tag-market/list', authenticateTokenOrAdmin, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    
    if (!authReq.userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    
    const { instanceId, price } = req.body;
    if (!instanceId || !price) return res.status(400).json({ error: 'Instance ID and price required' });

    const instance = await prisma.nFTTagInstance.findUnique({ where: { id: instanceId } });
    if (!instance || instance.ownerId !== authReq.userId) return res.status(403).json({ error: 'You do not own this tag' });

    const user = await prisma.user.findUnique({ where: { id: authReq.userId } });
    const isAdmin = user?.email === 'admin@нексо.com';
    if (!isAdmin && price > 1000) return res.status(400).json({ error: 'P2P listings limited to 1000 beavers' });

    const listing = await prisma.nFTTagMarketListing.create({
      data: { tagId: instance.tagId, instanceId, sellerId: authReq.userId, price, isFromНексо: isAdmin },
      include: { tag: true },
    });
    res.json(listing);
  } catch (error) {
    console.error('Error listing tag:', error);
    res.status(500).json({ error: 'Failed to list tag' });
  }
});

// Получить объявления тегов
// Получить объявления тегов (доступно всем)
router.get('/tag-market', async (req, res) => {
  try {
    const { isFromНексо, rarity, minPrice, maxPrice, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const where: any = {};
    if (isFromНексо !== undefined) where.isFromНексо = isFromНексо === 'true';
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = parseInt(minPrice as string);
      if (maxPrice) where.price.lte = parseInt(maxPrice as string);
    }
    let listings = await prisma.nFTTagMarketListing.findMany({
      where,
      include: { tag: true },
      orderBy: { [sortBy as string]: sortOrder },
    });
    if (rarity) listings = listings.filter((l: any) => l.tag.rarity === rarity);
    res.json(listings);
  } catch (error) {
    console.error('Error fetching tag market:', error);
    res.status(500).json({ error: 'Failed to fetch tag market' });
  }
});

// Купить тег
router.post('/tag-market/:listingId/buy', authenticateTokenOrAdmin, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    
    if (!authReq.userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    
    const listingId = String(req.params.listingId);

    // CRITICAL FIX: Use transaction with FOR UPDATE lock to prevent race conditions
      const result = await prisma.$transaction(async (tx) => {
      const lockedListing = await tx.nFTTagMarketListing.findUnique({
        where: { id: listingId },
        include: { tag: true },
      });
      
      if (!lockedListing) return res.status(404).json({ error: 'Listing not found' });

      const buyer = await tx.user.findUnique({ where: { id: authReq.userId } });
      if (!buyer || buyer.beavers < lockedListing.price) return res.status(400).json({ error: 'Insufficient beavers' });

      if (lockedListing.isFromНексо) {
        if (lockedListing.tag.currentSupply >= lockedListing.tag.totalSupply) return res.status(400).json({ error: 'Sold out' });
        const serialNumber = lockedListing.tag.currentSupply + 1;
        const instance = await tx.nFTTagInstance.create({
          data: { tagId: lockedListing.tagId!, ownerId: authReq.userId!, serialNumber, purchasePrice: lockedListing.price },
        });
        await tx.nFTTag.update({ where: { id: lockedListing.tagId }, data: { currentSupply: { increment: 1 } } });
        await tx.user.update({ where: { id: authReq.userId }, data: { beavers: { decrement: lockedListing.price }, totalSpent: { increment: lockedListing.price } } });
        if (serialNumber >= lockedListing.tag.totalSupply) {
          await tx.nFTTagMarketListing.delete({ where: { id: listingId } });
        }
        // Получить обновлённый баланс
        const updatedBuyer = await tx.user.findUnique({
          where: { id: authReq.userId },
          select: { beavers: true, totalSpent: true, totalEarned: true },
        });
        return res.json({ instance, listing: lockedListing, newBalance: updatedBuyer?.beavers || 0 });
      }

      // P2P
      if (!lockedListing.instanceId) {
        return res.status(400).json({ error: 'Invalid listing instance' });
      }

      const instance = await tx.nFTTagInstance.update({
        where: { id: lockedListing.instanceId },
        data: { ownerId: authReq.userId, isEquipped: false, purchasePrice: lockedListing.price, receivedAt: new Date() },
      });
      await tx.user.update({ where: { id: lockedListing.sellerId }, data: { beavers: { increment: lockedListing.price }, totalEarned: { increment: lockedListing.price } } });
      await tx.user.update({ where: { id: authReq.userId }, data: { beavers: { decrement: lockedListing.price }, totalSpent: { increment: lockedListing.price } } });
      await tx.nFTTagMarketListing.delete({ where: { id: listingId } });

      const io = getSocket();
      if (io) {
        io.to(`user:${lockedListing.sellerId}`).emit('nft:sold', { cardName: lockedListing.tag.name, price: lockedListing.price, buyerId: authReq.userId });
      }
      
      // Получить обновлённый баланс
      const updatedBuyer = await tx.user.findUnique({
        where: { id: authReq.userId },
        select: { beavers: true, totalSpent: true, totalEarned: true },
      });
      
      return res.json({ instance, listing: lockedListing, newBalance: updatedBuyer?.beavers || 0 });
    });
    
    return result;
  } catch (error: any) {
    console.error('Error buying tag:', error);
    res.status(500).json({ error: error.message || 'Failed to buy tag' });
  }
});

// Снять тег с продажи
router.delete('/tag-market/:listingId', authenticateTokenOrAdmin, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    
    if (!authReq.userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    
    const listing = await prisma.nFTTagMarketListing.findUnique({ where: { id: String(req.params.listingId) } });
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.sellerId !== authReq.userId) return res.status(403).json({ error: 'Not your listing' });
    await prisma.nFTTagMarketListing.delete({ where: { id: String(req.params.listingId) } });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting tag listing:', error);
    res.status(500).json({ error: 'Failed to delete listing' });
  }
});

// Получить надетые NFT пользователя (для профиля)
router.get('/equipped/:userId', async (req, res) => {
  try {
    const targetUserId = String(req.params.userId);
    const equippedCard = await prisma.nFTInstance.findFirst({
      where: { ownerId: targetUserId, isEquipped: true },
      include: { card: true },
    });
    const equippedTags = await prisma.nFTTagInstance.findMany({
      where: { ownerId: targetUserId, isEquipped: true },
      include: { tag: true },
      orderBy: { slot: 'asc' },
    });
    res.json({ card: equippedCard, tags: equippedTags });
  } catch (error) {
    console.error('Error fetching equipped NFTs:', error);
    res.status(500).json({ error: 'Failed to fetch equipped NFTs' });
  }
});

export default router;
