import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Gift, ShoppingBag, Sparkles, User, Calendar, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';
import { useToastStore } from '../stores/toastStore';
import NFTCardPreview from './NFTCardPreview';
import NFTGiftModal from './NFTGiftModal';
import BeaverIcon from './BeaverIcon';

interface NFTCard {
  id: string;
  name: string;
  rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary';
  photoUrl: string;
  effectUrls: string;
  backgroundColor?: string;
  gradientColors?: string;
  borderColor?: string;
  borderWidth: number;
  currentPrice: number;
  totalSupply: number;
}

interface NFTInstance {
  id: string;
  cardId: string;
  serialNumber: number;
  isEquipped: boolean;
  receivedFrom?: string;
  receivedMessage?: string;
  purchasePrice: number;
  receivedAt: string;
  card: NFTCard;
}

interface NFTTag {
  id: string;
  name: string;
  iconUrl: string;
  backgroundColor?: string;
  glowColor?: string;
  rarity: string;
  currentPrice: number;
  totalSupply: number;
}

interface NFTTagInstance {
  id: string;
  tagId: string;
  serialNumber: number;
  isEquipped: boolean;
  slot?: number;
  purchasePrice: number;
  receivedAt: string;
  tag: NFTTag;
}

interface NFTInventoryModalProps {
  onClose: () => void;
  embedded?: boolean;
}

const rarityColors: Record<string, string> = {
  Common: 'text-gray-400',
  Rare: 'text-blue-400',
  Epic: 'text-purple-400',
  Legendary: 'text-orange-400',
};

const rarityBg: Record<string, string> = {
  Common: 'bg-gray-500/20',
  Rare: 'bg-blue-500/20',
  Epic: 'bg-purple-500/20',
  Legendary: 'bg-orange-500/20',
};

const userCache: Record<string, { username: string; avatar?: string }> = {};

function useUserInfo(userId?: string) {
  const [info, setInfo] = useState<{ username: string; avatar?: string } | null>(null);
  useEffect(() => {
    if (!userId) return;
    if (userCache[userId]) { setInfo(userCache[userId]); return; }
    api.get(`/users/${userId}`).then((r: any) => {
      const u = { username: r.data?.username || r.data?.displayName || userId.slice(0, 8), avatar: r.data?.avatar };
      userCache[userId] = u;
      setInfo(u);
    }).catch(() => {});
  }, [userId]);
  return info;
}

function SenderInfo({ userId, date }: { userId: string; date: string }) {
  const info = useUserInfo(userId);
  return (
    <div className="flex items-center gap-2 mt-1.5 p-1.5 bg-white/5 rounded-lg">
      {info?.avatar ? (
        <img src={info.avatar} className="w-6 h-6 rounded-xl object-cover" alt="" />
      ) : (
        <div className="w-6 h-6 rounded-xl bg-purple-500/30 flex items-center justify-center flex-shrink-0">
          <User className="w-3 h-3 text-purple-300" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-medium text-white truncate">@{info?.username || userId.slice(0, 8)}</div>
        <div className="text-[10px] text-white/40 flex items-center gap-1">
          <Calendar className="w-2.5 h-2.5" />
          {new Date(date).toLocaleDateString('ru-RU')}
        </div>
      </div>
    </div>
  );
}

export default function NFTInventoryModal({ onClose, embedded }: NFTInventoryModalProps) {
  const [tab, setTab] = useState<'cards' | 'tags'>('cards');
  const [cards, setCards] = useState<NFTInstance[]>([]);
  const [tags, setTags] = useState<NFTTagInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCard, setSelectedCard] = useState<NFTInstance | null>(null);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const { success: showSuccess, error: showError } = useToastStore();

  useEffect(() => { loadInventory(); }, []);

  const loadInventory = async () => {
    try {
      setLoading(true);
      const data = await api.get<{ cards: NFTInstance[]; tags: NFTTagInstance[] }>('/nft/inventory');
      setCards(data.cards || []);
      setTags(data.tags || []);
    } catch (e: any) {
      showError(e.message || 'Не удалось загрузить инвентарь');
      setCards([]);
      setTags([]);
    } finally {
      setLoading(false);
    }
  };

  const handleEquip = async (instanceId: string, isEquipped: boolean) => {
    try {
      await api.post(`/nft/instances/${instanceId}/${isEquipped ? 'unequip' : 'equip'}`, {});
      showSuccess(isEquipped ? 'Карточка снята' : 'Карточка надета! ✨');
      loadInventory();
    } catch (e: any) { showError(e.message || 'Ошибка при надевании карточки'); }
  };

  const handleEquipTag = async (instanceId: string, isEquipped: boolean, currentSlot: number | undefined, targetSlot: number) => {
    try {
      if (isEquipped && currentSlot === targetSlot) {
        await api.post(`/nft/tag-instances/${instanceId}/unequip`, {});
        showSuccess('Тег снят');
      } else {
        await api.post(`/nft/tag-instances/${instanceId}/equip`, { slot: targetSlot });
        showSuccess(`Тег надет в слот ${targetSlot}!`);
      }
      loadInventory();
    } catch (e: any) { showError(e.message || 'Ошибка при надевании тега'); }
  };

  const handleSellCard = async (instanceId: string) => {
    const price = prompt('Цена продажи (1–1000 бобров):');
    if (!price) return;
    const priceNum = parseInt(price);
    if (isNaN(priceNum) || priceNum < 1 || priceNum > 1000) { showError('Цена: 1–1000 бобров'); return; }
    try {
      await api.post('/nft/market/list', { instanceId, price: priceNum });
      showSuccess('Выставлено на продажу!');
      loadInventory();
    } catch { showError('Ошибка при выставлении на продажу'); }
  };

  const handleSellTag = async (instanceId: string) => {
    const price = prompt('Цена продажи (1–1000 бобров):');
    if (!price) return;
    const priceNum = parseInt(price);
    if (isNaN(priceNum) || priceNum < 1 || priceNum > 1000) { showError('Цена: 1–1000 бобров'); return; }
    try {
      await api.post('/nft/tag-market/list', { instanceId, price: priceNum });
      showSuccess('Тег выставлен на продажу!');
      loadInventory();
    } catch { showError('Ошибка при выставлении тега'); }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-purple-500 border-t-transparent" />
        </div>
      );
    }

    if (tab === 'cards') {
      return (
        <div className="space-y-2">
          {cards.length === 0 ? (
            <div className="text-center py-12 text-white/40 text-sm">У вас пока нет NFT карточек</div>
          ) : cards.map(instance => (
            <motion.div
              key={instance.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/5 rounded-xl overflow-hidden border border-white/5 flex gap-3 p-3"
            >
              {/* Preview */}
              <div className="relative w-16 h-20 flex-shrink-0 rounded-lg overflow-hidden">
                <NFTCardPreview card={instance.card} />
                {instance.isEquipped && (
                  <div className="absolute top-1 right-1 bg-green-500 text-white text-[9px] px-1 py-0.5 rounded-full font-medium shadow">✓</div>
                )}
                <div className={`absolute top-1 left-1 text-[9px] px-1 py-0.5 rounded-full font-medium ${rarityBg[instance.card.rarity]} ${rarityColors[instance.card.rarity]}`}>
                  {instance.card.rarity[0]}
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div>
                  <div className="font-semibold text-sm text-white truncate">{instance.card.name}</div>
                  <div className="text-xs text-white/40">#{instance.serialNumber}/{instance.card.totalSupply}</div>
                  <div className="text-xs text-purple-400 flex items-center gap-1 mt-0.5">
                    {instance.card.currentPrice} <BeaverIcon size={11} />
                  </div>
                  {instance.receivedFrom && <SenderInfo userId={instance.receivedFrom} date={instance.receivedAt} />}
                  {instance.receivedMessage && (
                    <div className="text-[10px] text-white/40 italic mt-1 truncate">"{instance.receivedMessage}"</div>
                  )}
                </div>
                <div className="flex gap-1.5 mt-2">
                  <button
                    onClick={() => handleEquip(instance.id, instance.isEquipped)}
                    className={`flex-1 py-1.5 rounded-lg font-medium text-xs transition-all ${
                      instance.isEquipped
                        ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                        : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                    }`}
                  >
                    {instance.isEquipped ? 'Снять' : 'Надеть'}
                  </button>
                  <button
                    onClick={() => { setSelectedCard(instance); setShowGiftModal(true); }}
                    className="p-1.5 bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded-lg transition-all"
                    title="Подарить"
                  >
                    <Gift className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleSellCard(instance.id)}
                    className="p-1.5 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-lg transition-all"
                    title="Продать"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      );
    }

    // Tags
    return (
      <div className="grid grid-cols-2 gap-2">
        {tags.length === 0 ? (
          <div className="col-span-full text-center py-12 text-white/40 text-sm">У вас пока нет тегов</div>
        ) : tags.map(instance => (
          <motion.div
            key={instance.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white/5 rounded-xl p-3 border border-white/5"
          >
            <div className="relative w-12 h-12 mx-auto mb-2">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
                style={{
                  background: instance.tag.backgroundColor || '#333',
                  boxShadow: instance.tag.glowColor ? `0 0 16px ${instance.tag.glowColor}` : 'none',
                }}
              >
                {instance.tag.iconUrl}
              </div>
              {instance.isEquipped && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center text-[9px] text-white">✓</div>
              )}
            </div>
            <div className="font-medium text-xs text-center mb-1 truncate">{instance.tag.name}</div>
            <div className={`text-[10px] text-center mb-1 ${rarityColors[instance.tag.rarity] || 'text-gray-400'}`}>{instance.tag.rarity}</div>
            <div className="text-[10px] text-white/40 text-center mb-1">#{instance.serialNumber}/{instance.tag.totalSupply}</div>
            <div className="text-[10px] text-purple-400 text-center mb-2 flex items-center justify-center gap-1">
              {instance.tag.currentPrice} <BeaverIcon size={10} />
            </div>
            {instance.isEquipped && (
              <div className="text-[10px] text-green-400 text-center mb-1">Слот {instance.slot}</div>
            )}
            <div className="flex gap-1 mb-1">
              {[1, 2].map(slot => (
                <button
                  key={slot}
                  onClick={() => handleEquipTag(instance.id, instance.isEquipped, instance.slot, slot)}
                  className={`flex-1 py-1 text-[10px] rounded transition-all ${
                    instance.isEquipped && instance.slot === slot
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                  }`}
                >
                  {instance.isEquipped && instance.slot === slot ? 'Снять' : `Слот ${slot}`}
                </button>
              ))}
            </div>
            <button
              onClick={() => handleSellTag(instance.id)}
              className="w-full py-1 text-[10px] bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded transition-all flex items-center justify-center gap-1"
            >
              <ShoppingBag className="w-3 h-3" /> Продать
            </button>
          </motion.div>
        ))}
      </div>
    );
  };

  const header = (
    <div className="flex items-center gap-3 px-4 h-14 border-b border-white/[0.06] flex-shrink-0 bg-white/[0.02]">
      <button
        onClick={onClose}
        className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-all flex-shrink-0"
      >
        {embedded ? <ArrowLeft size={18} /> : <X size={18} />}
      </button>
      <div className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0">
        <Sparkles size={15} className="text-purple-400" />
      </div>
      <h3 className="text-sm font-semibold text-white flex-1 truncate">Мои подарки / NFT</h3>
    </div>
  );

  const tabBar = (
    <div className="flex gap-2 px-4 py-2 border-b border-white/[0.06] flex-shrink-0">
      {(['cards', 'tags'] as const).map(t => (
        <button
          key={t}
          onClick={() => setTab(t)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            tab === t ? 'bg-purple-500 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'
          }`}
        >
          {t === 'cards' ? `Подарки (${cards.length})` : `Теги (${tags.length})`}
        </button>
      ))}
    </div>
  );

  const giftModalEl = (
    <AnimatePresence>
      {showGiftModal && selectedCard && (
        <NFTGiftModal
          instance={selectedCard}
          onClose={() => { setShowGiftModal(false); setSelectedCard(null); }}
          onSuccess={() => { setShowGiftModal(false); setSelectedCard(null); loadInventory(); }}
        />
      )}
    </AnimatePresence>
  );

  if (embedded) {
    return (
      <div className="flex flex-col h-full w-full overflow-hidden">
        {header}
        {tabBar}
        <div className="flex-1 overflow-y-auto p-4">
          {renderContent()}
        </div>
        {giftModalEl}
      </div>
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: -400, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -400, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-[#0a0a0f]/95 backdrop-blur-3xl border-r border-white/[0.12] w-full sm:w-[420px] h-full overflow-hidden shadow-2xl flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {header}
          {tabBar}
          <div className="flex-1 overflow-y-auto p-4">
            {renderContent()}
          </div>
        </motion.div>
      </motion.div>
      {giftModalEl}
    </>
  );
}
