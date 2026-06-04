import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Crown, Check, Coins, Calendar, Lock, Unlock } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

interface SubscriptionInfo {
  channelId: string;
  priceMonthly: number;
  isSubscribed: boolean;
  expiresAt: string | null;
  isFree: boolean;
}

interface ChannelSubscriptionModalProps {
  channelId: string;
  channelName: string;
  onClose: () => void;
  onSubscribed?: () => void;
}

export default function ChannelSubscriptionModal({
  channelId,
  channelName,
  onClose,
  onSubscribed,
}: ChannelSubscriptionModalProps) {
  const { user } = useAuthStore();
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadInfo();
  }, [channelId]);

  const loadInfo = async () => {
    setLoading(true);
    try {
      const data = await api.get(`/channel-subscriptions/${channelId}`);
      setInfo(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    setSubscribing(true);
    setError(null);
    try {
      await api.post(`/channel-subscriptions/${channelId}/subscribe`, { months: selectedMonths });
      setSuccess(true);
      await loadInfo();
      onSubscribed?.();
      setTimeout(onClose, 2000);
    } catch (e: any) {
      setError(e.message || 'Ошибка подписки');
    } finally {
      setSubscribing(false);
    }
  };

  const monthOptions = [
    { months: 1, label: '1 месяц', discount: 0 },
    { months: 3, label: '3 месяца', discount: 5 },
    { months: 6, label: '6 месяцев', discount: 10 },
    { months: 12, label: '12 месяцев', discount: 20 },
  ];

  const getPrice = (months: number, discount: number) => {
    if (!info) return 0;
    const base = info.priceMonthly * months;
    return Math.floor(base * (1 - discount / 100));
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm bg-[#0f0f14] rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4 text-center">
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/10 transition-colors">
            <X size={16} />
          </button>
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-amber-500/30">
            <Crown size={28} className="text-white" />
          </div>
          <h2 className="text-lg font-bold text-white">{channelName}</h2>
          <p className="text-sm text-zinc-400 mt-1">Платная подписка</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-nexo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : success ? (
          <div className="px-6 pb-6 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
              <Check size={28} className="text-green-400" />
            </div>
            <p className="text-white font-medium">Подписка оформлена!</p>
            <p className="text-sm text-zinc-400 mt-1">Добро пожаловать в {channelName}</p>
          </div>
        ) : info?.isSubscribed ? (
          <div className="px-6 pb-6">
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
              <Unlock size={20} className="text-green-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-green-400">Вы подписаны</p>
              {info.expiresAt && (
                <p className="text-xs text-zinc-500 mt-1">
                  <Calendar size={10} className="inline mr-1" />
                  До {formatDate(info.expiresAt)}
                </p>
              )}
            </div>
            <div className="mt-4 text-center">
              <p className="text-xs text-zinc-500 flex items-center justify-center gap-1">Баланс: <span className="text-amber-400 font-medium flex items-center gap-1">{user?.beavers || 0} <BeaverIcon size={14} /></span></p>
            </div>
          </div>
        ) : (
          <div className="px-6 pb-6">
            {/* Balance */}
            <div className="flex items-center justify-between mb-4 px-3 py-2 rounded-xl bg-white/5">
              <span className="text-xs text-zinc-500">Ваш баланс</span>
              <span className="text-sm font-medium text-amber-400 flex items-center gap-1">
                <BeaverIcon size={16} /> {user?.beavers || 0} бобров
              </span>
            </div>

            {/* Plan selection */}
            <p className="text-xs text-zinc-500 mb-2 font-medium">Выберите период</p>
            <div className="space-y-2 mb-4">
              {monthOptions.map(({ months, label, discount }) => {
                const price = getPrice(months, discount);
                const isSelected = selectedMonths === months;
                return (
                  <button
                    key={months}
                    onClick={() => setSelectedMonths(months)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-nexo-500/50 bg-nexo-500/10 text-white'
                        : 'border-white/10 bg-white/5 text-zinc-400 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-nexo-500 bg-nexo-500' : 'border-zinc-600'}`}>
                        {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <span className="text-sm">{label}</span>
                      {discount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">
                          -{discount}%
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-medium flex items-center gap-1">
                      <BeaverIcon size={14} /> {price}
                    </span>
                  </button>
                );
              })}
            </div>

            {error && (
              <div className="mb-3 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                {error}
              </div>
            )}

            <button
              onClick={handleSubscribe}
              disabled={subscribing}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {subscribing ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Crown size={16} />
                  Подписаться за <BeaverIcon size={16} className="inline" /> {getPrice(selectedMonths, monthOptions.find(m => m.months === selectedMonths)?.discount || 0)}
                </>
              )}
            </button>

            <p className="text-[10px] text-zinc-600 text-center mt-2">
              1 бобёр = 1 рубль · Пополнить баланс в настройках
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
