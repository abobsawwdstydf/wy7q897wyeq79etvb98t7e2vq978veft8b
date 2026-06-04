import { PrismaClient } from '@prisma/client';
import { getSocket } from '../socket';

const prisma = new PrismaClient();

/**
 * Обновляет цены NFT карточек с включенными акциями
 * Запускается каждый день в 00:00
 */
export async function updateNFTStockPrices() {
  try {
    console.log('[NFT STOCK] Starting price update...');
    
    const cards = await prisma.nFTCard.findMany({
      where: { isStockEnabled: true },
    });
    
    if (cards.length === 0) {
      console.log('[NFT STOCK] No cards with stock enabled');
      return;
    }
    
    let updated = 0;
    
    for (const card of cards) {
      try {
        // 1. Случайное изменение ±volatility%
        const randomChange = (Math.random() - 0.5) * 2 * card.stockVolatility;
        
        // 2. Учесть продажи за последние 24 часа (+10% за каждую продажу)
        const recentSales = await prisma.nFTTransaction.count({
          where: {
            itemId: card.id,
            type: 'purchase',
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        });
        
        const salesBoost = recentSales * 10;
        
        // 3. Проверить последнюю продажу (-3% если не покупали 3 дня)
        const lastSale = await prisma.nFTTransaction.findFirst({
          where: { itemId: card.id, type: 'purchase' },
          orderBy: { createdAt: 'desc' },
        });
        
        let inactivityPenalty = 0;
        if (lastSale) {
          const daysSinceLastSale = (Date.now() - lastSale.createdAt.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceLastSale >= 3) {
            inactivityPenalty = -3;
          }
        }
        
        // 4. Рассчитать итоговое изменение
        const totalChange = randomChange + salesBoost + inactivityPenalty;
        const newPrice = Math.max(1, Math.round(card.currentPrice * (1 + totalChange / 100)));
        
        // 5. Обновить цену
        await prisma.nFTCard.update({
          where: { id: card.id },
          data: {
            currentPrice: newPrice,
            lastPriceUpdate: new Date(),
          },
        });
        
        // 6. Записать в историю
        await prisma.nFTPriceHistory.create({
          data: {
            cardId: card.id,
            price: newPrice,
            change: totalChange,
            reason: 'stock_update',
          },
        });
        
        // 7. Уведомить владельцев если изменение > 10%
        if (Math.abs(totalChange) > 10) {
          const io = getSocket();
          if (io) {
            const owners = await prisma.nFTInstance.findMany({
              where: { cardId: card.id },
              select: { ownerId: true },
            });
            
            owners.forEach(owner => {
              io.to(`user:${owner.ownerId}`).emit('nft:price_changed', {
                cardId: card.id,
                cardName: card.name,
                oldPrice: card.currentPrice,
                newPrice: newPrice,
                change: totalChange,
              });
            });
          }
        }
        
        updated++;
        
        console.log(`[NFT STOCK] ${card.name}: ${card.currentPrice} → ${newPrice} (${totalChange > 0 ? '+' : ''}${totalChange.toFixed(2)}%)`);
      } catch (error) {
        console.error(`[NFT STOCK] Error updating ${card.name}:`, error);
      }
    }
    
    console.log(`[NFT STOCK] Updated ${updated}/${cards.length} cards`);
  } catch (error) {
    console.error('[NFT STOCK] Error in updateNFTStockPrices:', error);
  }
}

/**
 * Запустить автоматическое обновление цен каждый день в 00:00
 */
export function startNFTStockUpdater() {
  // Запустить сразу при старте
  updateNFTStockPrices();
  
  // Затем каждые 24 часа
  setInterval(updateNFTStockPrices, 24 * 60 * 60 * 1000);
  
  console.log('[NFT STOCK] Stock updater started (runs every 24 hours)');
}
