import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createListings() {
  console.log('[NFT] Creating market listings for existing cards and tags...');

  try {
    // Получаем админа или создаём если нет
    let admin = await prisma.user.findFirst({
      where: { email: 'admin@нексо.com' },
    });

    if (!admin) {
      console.log('[NFT] Admin not found, creating...');
      admin = await prisma.user.create({
        data: {
          email: 'admin@нексо.com',
          username: 'admin',
          displayName: 'Admin',
          password: 'admin123', // Временный пароль
          beavers: 1000000, // Даём админу много бобров
        },
      });
      console.log('[NFT] Admin created:', admin.username);
    } else {
      console.log('[NFT] Admin found:', admin.username);
    }

    // Получаем все карточки
    const cards = await prisma.nFTCard.findMany();
    console.log(`[NFT] Found ${cards.length} cards`);

    // Создаём листинги для карточек
    for (const card of cards) {
      // Проверяем есть ли уже листинг
      const existingListing = await prisma.nFTMarketListing.findFirst({
        where: {
          cardId: card.id,
          isFromНексо: true,
        },
      });

      if (existingListing) {
        console.log(`[NFT] Listing already exists for card: ${card.name}`);
        continue;
      }

      // Создаём листинг
      await prisma.nFTMarketListing.create({
        data: {
          cardId: card.id,
          sellerId: admin.id,
          price: card.priceFromНексо || 0,
          isFromНексо: true,
        },
      });

      console.log(`[NFT] ✓ Created listing for card: ${card.name} (${card.priceFromНексо} бобров)`);
    }

    // Получаем все теги
    const tags = await prisma.nFTTag.findMany();
    console.log(`[NFT] Found ${tags.length} tags`);

    // Создаём листинги для тегов
    for (const tag of tags) {
      // Проверяем есть ли уже листинг
      const existingListing = await prisma.nFTTagMarketListing.findFirst({
        where: {
          tagId: tag.id,
          isFromНексо: true,
        },
      });

      if (existingListing) {
        console.log(`[NFT] Listing already exists for tag: ${tag.name}`);
        continue;
      }

      // Создаём листинг
      await prisma.nFTTagMarketListing.create({
        data: {
          tagId: tag.id,
          sellerId: admin.id,
          price: tag.priceFromНексо || 0,
          isFromНексо: true,
        },
      });

      console.log(`[NFT] ✓ Created listing for tag: ${tag.name} (${tag.priceFromНексо} бобров)`);
    }

    console.log('[NFT] ✓ All listings created successfully!');
  } catch (error) {
    console.error('[NFT] Error creating listings:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createListings();
