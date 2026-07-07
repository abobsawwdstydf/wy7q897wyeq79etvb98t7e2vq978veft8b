import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Gift, Send } from 'lucide-react';
import { api } from '../lib/api';
import { useToastStore } from '../stores/toastStore';
import NFTCardPreview from './NFTCardPreview';
import BottomSheet from './BottomSheet';

interface NFTCard {
  name: string;
  rarity: string;
  photoUrl: string;
  effectUrls: string;
  backgroundColor?: string;
  gradientColors?: string;
  borderColor?: string;
  borderWidth: number;
}

interface NFTInstance {
  id: string;
  serialNumber: number;
  card: NFTCard;
}

interface NFTGiftModalProps {
  instance: NFTInstance;
  onClose: () => void;
  onSuccess: () => void;
}

export default function NFTGiftModal({ instance, onClose, onSuccess }: NFTGiftModalProps) {
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  const { success, error } = useToastStore();

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleGift = async () => {
    if (!username.trim()) {
      error('Введите юзернейм получателя');
      return;
    }

    try {
      setLoading(true);
      
      // Найти пользователя по username
      const users = await api.get<any[]>(`/users/search?q=${encodeURIComponent(username.trim())}`);
      
      if (!users || users.length === 0) {
        error('Пользователь не найден');
        return;
      }

      // Найти точное совпадение по username
      const target = users.find((u: any) => u.username === username.trim()) || users[0];
      const toUserId = target.id;

      // Подарить
      await api.post(`/nft/instances/${instance.id}/gift`, {
        toUserId,
        message: message.trim() || 'Подарок для тебя! 🎁',
      });

      success(`NFT подарена пользователю @${target.username}! 🎁`);
      onSuccess();
    } catch (err: any) {
      error(err?.message || 'Ошибка при дарении NFT');
    } finally {
      setLoading(false);
    }
  };

  const content = (
    <div className="p-6">
      <div className="grid md:grid-cols-2 gap-6">
        {/* Card Preview */}
        <div>
          <div className="aspect-[3/4] rounded-xl overflow-hidden shadow-2xl">
            <NFTCardPreview card={instance.card} />
          </div>
          <div className="mt-4 text-center">
            <div className="font-bold text-lg">{instance.card.name}</div>
            <div className="text-sm text-white/60">
              #{instance.serialNumber} • {instance.card.rarity}
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-white/70">
              Получатель (юзернейм)
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-white/70">
              Сообщение (необязательно)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Поздравляю! 🎉"
              rows={4}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-purple-500 transition-colors resize-none"
            />
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 text-sm text-yellow-400">
            ⚠️ После дарения NFT будет передана получателю и исчезнет из вашего инвентаря
          </div>

          <button
            onClick={handleGift}
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
            ) : (
              <>
                <Send className="w-5 h-5" />
                Подарить
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <BottomSheet isOpen onClose={onClose} title="Подарить NFT" maxHeight="90vh">
        {content}
      </BottomSheet>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-[#1a1a1a] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <Gift className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold">Подарить NFT</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {content}
      </motion.div>
    </motion.div>
  );
}
