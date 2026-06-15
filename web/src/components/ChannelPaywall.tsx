import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Lock, Crown, Coins, Check, X, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import BeaverIcon from './BeaverIcon';

interface ChannelPaywallProps {
  channelId: string;
  channelName: string;
  channelAvatar?: string;
  onSubscribed: () => void;
  onClose: () => void;
}

export default function ChannelPaywall({
  channelId,
  channelName,
  channelAvatar,
  onSubscribed,
  onClose,
}: ChannelPaywallProps) {
  const { user, updateUser } = useAuthStore();
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState(1);
  const [confirmStep, setConfirmStep] = useState(false);

  useEffect(() => {
    loadInfo();
  }, [channelId]);

  const loadInfo = async () => {
    setLoading(true);
    try {
      const data = await api.get(`/channel-subscriptions/${channelId}`);
      setInfo(data);
      // If free or already subscribed, auto-pass
      if (data.isFree || data.isSubscribed) {
        onSubscribed();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
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

  const selectedOption = monthOptions.find(m => m.months === selectedMonths)!;
  const totalPrice = getPrice(selectedMonths, selectedOption.discount);
  const hasEnough = (user?.beavers || 0) >= totalPrice;

  const handleSubscribe = async () => {
    if (!confirmStep) {
      setConfirmStep(true);
      return;
    }
    setSubscribing(true);
    setError(null);
    try {
      const result = await api.post(`/channel-subscriptions/${channelId}/subscribe`, {
        months: selectedMonths,
      });
      updateUser({ beavers: (user?.beavers || 0) - totalPrice });
      setSuccess(true);
      setTimeout(() => {
        onSubscribed();
      }, 1500);
    } catch (e: any) {
      setError(e.message || 'Ошибка подписки');
      setConfirmStep(false);
    } finally {
      setSubscribing(false);
    }
  };

  const initials = channelName
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (loading) {
    return (
      <div className="fixed inset-0 z-[9995] flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="w-8 h-8 border-2 border-nexo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!info || info.isFree || info.isSubscribed) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[9995] flex items-end sm:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        className="w-full max-w-sm bg-[#0f0f14] rounded-t-2xl sm:rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
      >
        {/* Close button */}
        <div className="flex justify-end p-3 pb-0">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {success ? (
          <div className="px-6 pb-8 text-center">
            <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <Check size={36} className="text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Подписка оформлена!</h2>
            <p className="text-sm text-zinc-400">Добро пожаловать в {channelName}</p>
          </div>
        ) : confirmStep ? (
          <div className="px-6 pb-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/20 flex items-center justify-center mx-auto mb-3">
                <Crown size={28} className="text-amber-400" />
              </div>
              <h2 className="text-lg font-bold text-white">Подтвердите оплату</h2>
            </div>

            <div className="p-4 rounded-xl bg-white/5 border border-white/10 mb-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Канал:</span>
                <span className="text-white font-medium">{channelName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Период:</span>
                <span className="text-white">{selectedOption.label}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Стоимость:</span>
                <span className="text-amber-400 font-bold flex items-center gap-1">{totalPrice} <BeaverIcon size={14} /></span>
              </div>
              <div className="border-t border-white/10 pt-2 flex justify-between text-sm">
                <span className="text-zinc-400">Баланс после:</span>
                <span className={`font-medium flex items-center gap-1 ${hasEnough ? 'text-white' : 'text-red-400'}`}>
                  {(user?.beavers || 0) - totalPrice} <BeaverIcon size={14} />
                </span>
              </div>
            </div>

            {!hasEnough && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2">
                <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">
                  Недостаточно бобров. Нужно {totalPrice} <BeaverIcon size={12} className="inline" />, у вас {user?.beavers || 0} <BeaverIcon size={12} className="inline" />.
                  Пополните баланс в кошельке.
                </p>
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmStep(false)}
                className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-sm text-zinc-400 transition-colors"
              >
                Назад
              </button>
              <button
                onClick={handleSubscribe}
                disabled={subscribing || !hasEnough}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {subscribing ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Check size={16} />
                    Да, оплатить
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="px-6 pb-6">
            {/* Channel info */}
            <div className="flex flex-col items-center mb-6">
              <div className="w-20 h-20 rounded-2xl overflow-hidden mb-3 shadow-lg">
                {channelAvatar ? (
                  <img src={channelAvatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-nexo-500 to-purple-600 flex items-center justify-center text-white font-bold text-2xl">
                    {initials}
                  </div>
                )}
              </div>
              <h2 className="text-xl font-bold text-white text-center">{channelName}</h2>
              <div className="flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/30">
                <Lock size={12} className="text-amber-400" />
                <span className="text-xs text-amber-300 font-medium">Платный канал</span>
              </div>
            </div>

            <p className="text-sm text-zinc-400 text-center mb-5">
              Для просмотра контента этого канала необходима подписка.
              Выберите период и оплатите бобрами.
            </p>

            {/* Balance */}
            <div className="flex items-center justify-between mb-4 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
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
                        ? 'border-amber-500/50 bg-amber-500/10 text-white'
                        : 'border-white/10 bg-white/5 text-zinc-400 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        isSelected ? 'border-amber-500 bg-amber-500' : 'border-zinc-600'
                      }`}>
                        {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <span className="text-sm">{label}</span>
                      {discount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">
                          -{discount}%
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-medium flex items-center gap-1"><BeaverIcon size={14} /> {price}</span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleSubscribe}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
            >
              <Crown size={16} />
              Оплатить — <BeaverIcon size={16} className="inline" /> {totalPrice}
            </button>

            <p className="text-[10px] text-zinc-600 text-center mt-2">
              1 бобёр = 1 рубль · Пополнить баланс в кошельке
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
