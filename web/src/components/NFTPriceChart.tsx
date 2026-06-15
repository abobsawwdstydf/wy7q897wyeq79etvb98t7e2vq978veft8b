import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { api } from '../lib/api';
import BeaverIcon from './BeaverIcon';

interface PriceHistory {
  id: string;
  price: number;
  change: number;
  reason: string;
  createdAt: string;
}

interface NFTPriceChartProps {
  cardId: string;
  className?: string;
}

export default function NFTPriceChart({ cardId, className = '' }: NFTPriceChartProps) {
  const [history, setHistory] = useState<PriceHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, [cardId]);

  const loadHistory = async () => {
    try {
      const data = await api.get<PriceHistory[]>(`/nft/cards/${cardId}/price-history`);
      setHistory((data || []).slice(0, 30));
    } catch (err) {
      console.error('Failed to load price history:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`animate-pulse h-64 bg-white/5 rounded-lg ${className}`} />
    );
  }

  if (history.length === 0) {
    return (
      <div className={`bg-white/5 rounded-lg p-6 text-center text-white/40 ${className}`}>
        Нет истории цен
      </div>
    );
  }

  // Найти мин и макс для масштабирования
  const prices = history.map(h => h.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;

  // Текущая цена и изменение
  const currentPrice = history[0].price;
  const oldestPrice = history[history.length - 1].price;
  const totalChange = ((currentPrice - oldestPrice) / oldestPrice) * 100;

  return (
    <div className={`bg-white/5 rounded-lg p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold mb-1">История цен</h3>
          <div className="text-2xl font-bold text-purple-400 flex items-center gap-2">
            {currentPrice} <BeaverIcon size={24} />
          </div>
        </div>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
          totalChange >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
        }`}>
          {totalChange >= 0 ? (
            <TrendingUp className="w-5 h-5" />
          ) : (
            <TrendingDown className="w-5 h-5" />
          )}
          <span className="font-bold">
            {totalChange >= 0 ? '+' : ''}{totalChange.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Simple Line Chart */}
      <div className="relative h-48">
        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* Grid lines */}
          <line x1="0" y1="25" x2="100" y2="25" stroke="rgba(255,255,255,0.1)" strokeWidth="0.2" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.1)" strokeWidth="0.2" />
          <line x1="0" y1="75" x2="100" y2="75" stroke="rgba(255,255,255,0.1)" strokeWidth="0.2" />

          {/* Price line */}
          <polyline
            points={history
              .reverse()
              .map((h, i) => {
                const x = (i / (history.length - 1)) * 100;
                const y = 100 - ((h.price - minPrice) / priceRange) * 80 - 10;
                return `${x},${y}`;
              })
              .join(' ')}
            fill="none"
            stroke="rgb(168, 85, 247)"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Area under line */}
          <polygon
            points={`0,100 ${history
              .map((h, i) => {
                const x = (i / (history.length - 1)) * 100;
                const y = 100 - ((h.price - minPrice) / priceRange) * 80 - 10;
                return `${x},${y}`;
              })
              .join(' ')} 100,100`}
            fill="url(#gradient)"
            opacity="0.2"
          />

          {/* Gradient definition */}
          <defs>
            <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgb(168, 85, 247)" stopOpacity="1" />
              <stop offset="100%" stopColor="rgb(168, 85, 247)" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Recent changes */}
      <div className="mt-6 space-y-2">
        <div className="text-sm font-medium text-white/60 mb-3">Последние изменения</div>
        {history.slice(0, 5).map((item) => (
          <div key={item.id} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {item.change >= 0 ? (
                <TrendingUp className="w-4 h-4 text-green-400" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-400" />
              )}
              <span className="text-white/60">
                {new Date(item.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className={item.change >= 0 ? 'text-green-400' : 'text-red-400'}>
                {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}%
              </span>
              <span className="font-medium flex items-center gap-1">{item.price} <BeaverIcon size={12} /></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
