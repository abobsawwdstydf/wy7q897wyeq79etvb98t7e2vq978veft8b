import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp, TrendingDown, Package, DollarSign, Calendar, Info, Activity } from 'lucide-react';
import { api } from '../lib/api';
import BeaverIcon from './BeaverIcon';
import NFTCardPreview from './NFTCardPreview';
import BottomSheet from './BottomSheet';

interface NFTCard {
  id: string;
  name: string;
  description: string;
  rarity: string;
  totalSupply: number;
  currentSupply: number;
  photoUrl: string;
  effectUrls: string;
  backgroundColor?: string;
  gradientColors?: string;
  borderColor?: string;
  borderWidth: number;
  priceFromНексо: number;
  currentPrice: number;
  isStockEnabled: boolean;
  stockVolatility: number;
  createdAt: string;
}

interface NFTTag {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  backgroundColor?: string;
  glowColor?: string;
  rarity: string;
  totalSupply: number;
  currentSupply: number;
  priceFromНексо: number;
  currentPrice: number;
  isStockEnabled: boolean;
  stockVolatility: number;
  createdAt: string;
}

interface PriceHistory {
  id: string;
  price: number;
  change: number;
  reason: string;
  createdAt: string;
}

interface NFTStatsModalProps {
  itemId: string;
  itemType: 'card' | 'tag';
  onClose: () => void;
}

const rarityColors: Record<string, string> = {
  Common: 'text-gray-400',
  Rare: 'text-blue-400',
  Epic: 'text-purple-400',
  Legendary: 'text-orange-400',
};

export default function NFTStatsModal({ itemId, itemType, onClose }: NFTStatsModalProps) {
  const [item, setItem] = useState<NFTCard | NFTTag | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    loadStats();
  }, [itemId, itemType]);

  const loadStats = async () => {
    setLoading(true);
    try {
      if (itemType === 'card') {
        const [cardData, historyData] = await Promise.all([
          api.get(`/nft/cards/${itemId}`),
          api.get(`/nft/cards/${itemId}/price-history`),
        ]);
        setItem(cardData);
        setPriceHistory(historyData || []);
      } else {
        const [tagData, historyData] = await Promise.all([
          api.get(`/nft/tags/${itemId}`),
          api.get(`/nft/tags/${itemId}/price-history`),
        ]);
        setItem(tagData);
        setPriceHistory(historyData || []);
      }
    } catch (e) {
      console.error('Failed to load stats:', e);
    } finally {
      setLoading(false);
    }
  };

  const isCard = itemType === 'card';
  const card = isCard ? (item as NFTCard) : null;
  const tag = !isCard ? (item as NFTTag) : null;

  const priceChange = item ? item.currentPrice - item.priceFromНексо : 0;
  const priceChangePercent = item && item.priceFromНексо > 0 ? ((priceChange / item.priceFromНексо) * 100).toFixed(2) : '0';
  const isPositive = priceChange >= 0;

  const soldOut = item ? item.currentSupply >= item.totalSupply : false;
  const soldPercent = item ? ((item.currentSupply / item.totalSupply) * 100).toFixed(1) : '0';

  const statsContent = item ? (
    <>
      {/* Preview */}
      <div className="flex items-start gap-6">
        <div className="flex-shrink-0">
          {isCard && card ? (
            <div className="w-32 h-44">
              <NFTCardPreview card={card} />
            </div>
          ) : tag ? (
            <div className="w-32 h-32 rounded-2xl flex items-center justify-center text-6xl"
              style={{
                background: tag.backgroundColor || '#333',
                boxShadow: tag.glowColor ? `0 0 30px ${tag.glowColor}` : 'none',
              }}>
              {tag.iconUrl}
            </div>
          ) : null}
        </div>

        <div className="flex-1 space-y-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-sm font-medium ${rarityColors[item.rarity] || 'text-gray-400'}`}>
                {item.rarity}
              </span>
              {item.isStockEnabled && (
                <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full">
                  Акции включены
                </span>
              )}
            </div>
            <p className="text-sm text-zinc-400">{item.description || 'Нет описания'}</p>
          </div>

          {/* Current Price */}
          <div className="bg-white/5 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-500">Текущая цена</span>
              <div className={`flex items-center gap-1 text-xs ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {isPositive ? '+' : ''}{priceChangePercent}%
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold text-white">{item.currentPrice}</span>
              <BeaverIcon size={28} />
            </div>
            {item.priceFromНексо !== item.currentPrice && (
              <div className="text-xs text-zinc-500 mt-1">
                Начальная: {item.priceFromНексо} <BeaverIcon size={12} className="inline" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Supply */}
        <div className="bg-white/5 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Package size={16} className="text-blue-400" />
            <span className="text-sm font-medium text-white">Тираж</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Выпущено:</span>
              <span className="text-white font-medium">{item.currentSupply} / {item.totalSupply}</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${soldOut ? 'bg-red-500' : 'bg-blue-500'}`}
                style={{ width: `${soldPercent}%` }}
              />
            </div>
            <div className="text-xs text-zinc-500">
              {soldOut ? 'Распродано!' : `Осталось: ${item.totalSupply - item.currentSupply}`}
            </div>
          </div>
        </div>

        {/* Volatility */}
        {item.isStockEnabled && (
          <div className="bg-white/5 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity size={16} className="text-purple-400" />
              <span className="text-sm font-medium text-white">Волатильность</span>
            </div>
            <div className="space-y-2">
              <div className="text-2xl font-bold text-purple-400">±{item.stockVolatility}%</div>
              <div className="text-xs text-zinc-500">
                Изменение цены каждые 24 часа
              </div>
            </div>
          </div>
        )}

        {/* Created */}
        <div className="bg-white/5 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={16} className="text-green-400" />
            <span className="text-sm font-medium text-white">Создано</span>
          </div>
          <div className="text-sm text-zinc-400">
            {new Date(item.createdAt).toLocaleDateString('ru-RU', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </div>
        </div>

        {/* Info */}
        <div className="bg-white/5 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Info size={16} className="text-orange-400" />
            <span className="text-sm font-medium text-white">Тип</span>
          </div>
          <div className="text-sm text-zinc-400">
            {isCard ? 'NFT Карточка' : 'NFT Тег'}
          </div>
        </div>
      </div>

      {/* Price History */}
      {priceHistory.length > 0 && (
        <div className="bg-white/5 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={16} className="text-yellow-400" />
            <span className="text-sm font-medium text-white">История цен</span>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {priceHistory.slice(0, 10).map((entry, index) => (
              <div
                key={entry.id}
                className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${entry.change >= 0 ? 'bg-green-400' : 'bg-red-400'}`} />
                  <div>
                    <div className="text-sm text-white font-medium flex items-center gap-1">
                      {entry.price} <BeaverIcon size={14} />
                    </div>
                    <div className="text-xs text-zinc-500">
                      {new Date(entry.createdAt).toLocaleDateString('ru-RU', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
                <div className={`text-sm font-medium ${entry.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {entry.change >= 0 ? '+' : ''}{entry.change.toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Additional Info */}
      <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-xl p-4 border border-purple-500/20">
        <div className="flex items-start gap-3">
          <Info size={20} className="text-purple-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-zinc-300">
            <p className="font-medium text-white mb-1">О системе акций</p>
            <p className="text-xs text-zinc-400">
              {item.isStockEnabled
                ? `Цена этого ${isCard ? 'NFT' : 'тега'} меняется каждые 24 часа в зависимости от спроса. При покупке цена растёт на +10%, при отсутствии продаж 3+ дня падает на -3%.`
                : `Цена этого ${isCard ? 'NFT' : 'тега'} фиксирована и не меняется.`}
            </p>
          </div>
        </div>
      </div>
    </>
  ) : null;

  if (loading || !item) {
    if (isMobile) {
      return (
        <BottomSheet isOpen={true} onClose={onClose} title="Загрузка...">
          <div className="flex items-center justify-center p-10">
            <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        </BottomSheet>
      );
    }
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </motion.div>
    );
  }

  if (isMobile) {
    return (
      <BottomSheet
        isOpen={true}
        onClose={onClose}
        title={`${item.name} — Статистика`}
        maxHeight="90vh"
      >
        <div className="p-5 space-y-6">
          {statsContent}
        </div>
      </BottomSheet>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-[#1a1a1a] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl border border-white/10"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{item.name}</h2>
              <p className="text-sm text-zinc-400">Статистика и аналитика</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-88px)] p-6 space-y-6">
          {statsContent}
        </div>
      </motion.div>
    </motion.div>
  );
}
