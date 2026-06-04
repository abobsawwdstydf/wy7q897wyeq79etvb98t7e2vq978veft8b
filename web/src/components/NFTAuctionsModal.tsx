import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Gavel, TrendingUp, Clock } from 'lucide-react';
import { api } from '../lib/api';
import { useToastStore } from '../stores/toastStore';
import BeaverIcon from './BeaverIcon';

interface NFTAuctionsModalProps {
  onClose: () => void;
}

export default function NFTAuctionsModal({ onClose }: NFTAuctionsModalProps) {
  const [auctions, setAuctions] = useState<any[]>([]);
  const [selectedAuction, setSelectedAuction] = useState<any>(null);
  const [bidAmount, setBidAmount] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isBidding, setIsBidding] = useState(false);
  const { success, error } = useToastStore();

  useEffect(() => {
    loadAuctions();
    const interval = setInterval(loadAuctions, 10000); // Обновляем каждые 10 секунд
    return () => clearInterval(interval);
  }, []);

  const loadAuctions = async () => {
    try {
      const data = await api.getNFTAuctions();
      setAuctions(data);
    } catch (err) {
      console.error('Error loading auctions:', err);
      error('Не удалось загрузить аукционы');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBid = async () => {
    if (!selectedAuction || !bidAmount) return;

    const amount = parseInt(bidAmount);
    if (amount <= selectedAuction.currentPrice) {
      error('Ставка должна быть выше текущей цены');
      return;
    }

    setIsBidding(true);
    try {
      await api.bidNFTAuction(selectedAuction.id, amount);
      success('Ставка сделана!');
      setBidAmount('');
      await loadAuctions();
      setSelectedAuction(null);
    } catch (err: any) {
      console.error('Error bidding:', err);
      error(err.response?.data?.error || 'Не удалось сделать ставку');
    } finally {
      setIsBidding(false);
    }
  };

  const handleBuyout = async () => {
    if (!selectedAuction || !selectedAuction.buyoutPrice) return;

    setIsBidding(true);
    try {
      await api.buyoutNFTAuction(selectedAuction.id);
      success('NFT выкуплен!');
      await loadAuctions();
      setSelectedAuction(null);
    } catch (err: any) {
      console.error('Error buying out:', err);
      error(err.response?.data?.error || 'Не удалось выкупить');
    } finally {
      setIsBidding(false);
    }
  };

  const getTimeRemaining = (endsAt: string) => {
    const diff = new Date(endsAt).getTime() - Date.now();
    if (diff <= 0) return 'Завершён';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}д ${hours % 24}ч`;
    }
    return `${hours}ч ${minutes}м`;
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={onClose} />
      
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed inset-0 sm:inset-auto sm:right-3 sm:top-3 sm:bottom-3 sm:w-[600px] sm:rounded-2xl z-50 bg-surface-secondary border border-border flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Gavel size={20} className="text-nexo-400" />
            NFT Аукционы
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-zinc-500">Загрузка...</div>
            </div>
          ) : selectedAuction ? (
            <div className="p-4 space-y-4">
              <button onClick={() => setSelectedAuction(null)} className="text-sm text-nexo-400 hover:text-nexo-300">
                ← Назад к аукционам
              </button>

              {/* Auction details */}
              <div className="bg-surface rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-zinc-400 mb-1">Текущая ставка</div>
                    <div className="flex items-center gap-2 text-2xl font-bold">
                      <BeaverIcon size={24} />
                      <span>{selectedAuction.currentPrice}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-zinc-400 mb-1">Осталось</div>
                    <div className="flex items-center gap-1 text-lg font-medium">
                      <Clock size={18} />
                      <span>{getTimeRemaining(selectedAuction.endsAt)}</span>
                    </div>
                  </div>
                </div>

                {selectedAuction.buyoutPrice && (
                  <div className="flex items-center justify-between p-3 bg-nexo-500/10 rounded-lg">
                    <span className="text-sm">Цена выкупа</span>
                    <div className="flex items-center gap-1 font-medium">
                      <BeaverIcon size={16} />
                      <span>{selectedAuction.buyoutPrice}</span>
                    </div>
                  </div>
                )}

                {/* Bid history */}
                {selectedAuction.bids && selectedAuction.bids.length > 0 && (
                  <div>
                    <div className="text-sm font-medium mb-2">История ставок</div>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {selectedAuction.bids.map((bid: any) => (
                        <div key={bid.id} className="flex items-center justify-between text-sm p-2 bg-surface-secondary rounded-lg">
                          <span className="text-zinc-400">{bid.user?.displayName || bid.user?.username}</span>
                          <div className="flex items-center gap-1">
                            <BeaverIcon size={14} />
                            <span>{bid.amount}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Bid form */}
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Ваша ставка</label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input type="number" value={bidAmount} onChange={(e) => setBidAmount(e.target.value)} placeholder={`Минимум ${selectedAuction.currentPrice + 1}`} min={selectedAuction.currentPrice + 1} className="w-full px-4 py-3 pl-10 bg-surface rounded-xl border border-border focus:border-nexo-500 outline-none" />
                      <BeaverIcon size={18} className="absolute left-3 top-1/2 -translate-y-1/2" />
                    </div>
                    <button onClick={handleBid} disabled={isBidding || !bidAmount} className="px-6 py-3 bg-nexo-500 hover:bg-nexo-600 disabled:opacity-50 rounded-xl font-medium transition-colors whitespace-nowrap">
                      {isBidding ? 'Ставка...' : 'Сделать ставку'}
                    </button>
                  </div>
                </div>

                {selectedAuction.buyoutPrice && (
                  <button onClick={handleBuyout} disabled={isBidding} className="w-full py-3 bg-green-500 hover:bg-green-600 disabled:opacity-50 rounded-xl font-medium transition-colors">
                    Выкупить за {selectedAuction.buyoutPrice} бобров
                  </button>
                )}
              </div>
            </div>
          ) : auctions.length === 0 ? (
            <div className="flex items-center justify-center h-full text-zinc-500">
              Нет активных аукционов
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {auctions.map((auction) => (
                <button key={auction.id} onClick={() => setSelectedAuction(auction)} className="w-full bg-surface hover:bg-surface/80 rounded-xl p-4 transition-colors text-left">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <BeaverIcon size={20} />
                      <span className="text-xl font-bold">{auction.currentPrice}</span>
                      {auction.bids?.length > 0 && (
                        <span className="text-xs text-zinc-500">({auction.bids.length} ставок)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-sm text-zinc-400">
                      <Clock size={14} />
                      <span>{getTimeRemaining(auction.endsAt)}</span>
                    </div>
                  </div>
                  {auction.buyoutPrice && (
                    <div className="text-xs text-zinc-500">
                      Выкуп: {auction.buyoutPrice} бобров
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}
