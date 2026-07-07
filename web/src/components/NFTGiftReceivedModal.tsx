import { motion } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { useToastStore } from '../stores/toastStore';
import { useState, useEffect } from 'react';

interface NFTGiftReceivedModalProps {
  data: {
    fromUserId: string;
    cardName: string;
    message: string;
    instanceId: string;
    photoUrl?: string;
    effectUrls?: string;
    backgroundColor?: string;
    gradientColors?: string;
    borderColor?: string;
    borderWidth?: number;
    rarity?: string;
  };
  onClose: () => void;
}

function Confetti() {
  const colors = ['#a855f7', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444'];
  const pieces = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    color: colors[i % colors.length],
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 1.5}s`,
    duration: `${1.5 + Math.random() * 2}s`,
    size: `${6 + Math.random() * 8}px`,
    rotate: `${Math.random() * 360}deg`,
  }));
  return (
    <div className="fixed inset-0 pointer-events-none z-[101] overflow-hidden">
      {pieces.map(p => (
        <div key={p.id} className="absolute top-0 rounded-sm"
          style={{ left: p.left, width: p.size, height: p.size, backgroundColor: p.color, transform: `rotate(${p.rotate})`, animation: `confettiFall ${p.duration} ${p.delay} ease-in forwards` }}
        />
      ))}
      <style>{`@keyframes confettiFall { 0% { transform: translateY(-20px) rotate(0deg); opacity:1; } 100% { transform: translateY(100vh) rotate(720deg); opacity:0; } }`}</style>
    </div>
  );
}

const rarityColors: Record<string, string> = {
  Common: '#9ca3af', Rare: '#60a5fa', Epic: '#a78bfa', Legendary: '#fb923c',
};

export default function NFTGiftReceivedModal({ data, onClose }: NFTGiftReceivedModalProps) {
  const { success, error } = useToastStore();
  const [senderInfo, setSenderInfo] = useState<any>(null);
  const [loadingSender, setLoadingSender] = useState(true);

  // Загрузить информацию о дарителе
  useEffect(() => {
    const loadSender = async () => {
      try {
        const user = await api.get(`/users/${data.fromUserId}`);
        setSenderInfo(user);
      } catch (err) {
        console.error('Failed to load sender info:', err);
      } finally {
        setLoadingSender(false);
      }
    };
    loadSender();
  }, [data.fromUserId]);

  // Определить фон карточки
  let cardBg = '#333';
  if (data.gradientColors) {
    try { cardBg = `linear-gradient(135deg, ${JSON.parse(data.gradientColors).join(', ')})`; } catch {}
  } else if (data.backgroundColor) {
    cardBg = data.backgroundColor;
  }

  const handleEquip = async () => {
    try {
      await api.post(`/nft/instances/${data.instanceId}/equip`, {});
      success('Карточка надета! ✨');
      onClose();
    } catch {
      error('Ошибка при надевании');
    }
  };

  return (
    <>
      <Confetti />
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.5, opacity: 0, y: 50 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.5, opacity: 0, y: 50 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="relative bg-gradient-to-br from-purple-900/90 to-pink-900/90 rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-purple-500/30"
          onClick={e => e.stopPropagation()}
        >
          <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>

          {/* Заголовок */}
          <motion.h2
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="text-2xl font-bold text-center mb-4 bg-gradient-to-r from-purple-200 to-pink-200 bg-clip-text text-transparent"
          >
            Вы получили подарок! 🎁
          </motion.h2>

          {/* Превью NFT карточки */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3, type: 'spring' }}
            className="relative w-40 h-52 mx-auto mb-4 rounded-2xl overflow-hidden shadow-2xl"
            style={{
              background: cardBg,
              border: data.borderWidth ? `${data.borderWidth}px solid ${data.borderColor || '#fff'}` : 'none',
              boxShadow: data.rarity ? `0 0 30px ${rarityColors[data.rarity] || '#a855f7'}60` : undefined,
            }}
          >
            {data.photoUrl && (
              <img src={data.photoUrl} className="absolute inset-2 w-[calc(100%-16px)] h-[calc(100%-16px)] object-contain" alt="" />
            )}
            {/* Эффекты */}
            {data.effectUrls && JSON.parse(data.effectUrls || '[]').slice(0, 2).map((url: string, i: number) => (
              <div key={i} className="absolute inset-0 pointer-events-none"
                style={{ backgroundImage: `url(${url})`, backgroundSize: 'cover', opacity: 0.6, animation: `float${i} 4s ease-in-out infinite` }}
              />
            ))}
            <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
              <div className="text-xs font-bold text-white truncate">{data.cardName}</div>
              {data.rarity && (
                <div className="text-xs font-medium" style={{ color: rarityColors[data.rarity] || '#a855f7' }}>{data.rarity}</div>
              )}
            </div>
          </motion.div>

          <style>{`
            @keyframes float0 { 0%,100%{transform:translate(0,0) rotate(0deg)} 50%{transform:translate(8px,-8px) rotate(3deg)} }
            @keyframes float1 { 0%,100%{transform:translate(0,0) rotate(0deg)} 50%{transform:translate(-8px,8px) rotate(-3deg)} }
          `}</style>

          {/* Название */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
            className="text-center mb-3"
          >
            <div className="text-xl font-bold text-white flex items-center justify-center gap-2">
              <Sparkles className="w-5 h-5 text-yellow-400" />
              {data.cardName}
              <Sparkles className="w-5 h-5 text-yellow-400" />
            </div>
          </motion.div>

          {/* Сообщение */}
          {data.message && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
              className="bg-white/10 rounded-xl p-3 mb-3"
            >
              <div className="flex items-center gap-2 mb-2">
                {!loadingSender && senderInfo ? (
                  <>
                    <img
                      src={senderInfo.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${senderInfo.username}`}
                      alt={senderInfo.username}
                      className="w-8 h-8 rounded-xl object-cover border border-purple-400"
                    />
                    <div className="text-xs text-white/70">
                      <div className="font-semibold text-white">{senderInfo.name || senderInfo.username}</div>
                      <div className="text-white/50">@{senderInfo.username}</div>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-white/50">Загрузка...</div>
                )}
              </div>
              <div className="text-sm text-white italic">"{data.message}"</div>
            </motion.div>
          )}

          {/* Кнопки */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
            className="flex gap-2"
          >
            <button
              onClick={handleEquip}
              className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-xl font-bold text-white transition-all shadow-lg text-sm"
            >
              ✨ Надеть
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-medium text-white transition-all text-sm"
            >
              Позже
            </button>
          </motion.div>
        </motion.div>
      </motion.div>
    </>
  );
}
