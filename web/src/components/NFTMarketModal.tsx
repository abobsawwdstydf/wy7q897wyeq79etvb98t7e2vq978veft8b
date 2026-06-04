import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Filter, ShoppingCart, TrendingUp, Store, User, CheckCircle, Tag, HelpCircle, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';
import NFTCardPreview from './NFTCardPreview';
import BeaverIcon from './BeaverIcon';
import NFTStatsModal from './NFTStatsModal';
import BeaverPaymentModal from './BeaverPaymentModal';

interface NFTCard {
  id: string; name: string; rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary';
  photoUrl: string; effectUrls: string; backgroundColor?: string; gradientColors?: string;
  borderColor?: string; borderWidth: number; currentPrice: number; totalSupply: number; currentSupply: number;
}
interface NFTTag {
  id: string; name: string; iconUrl: string; backgroundColor?: string; glowColor?: string;
  rarity: string; currentPrice: number; totalSupply: number; currentSupply: number;
}
interface NFTListing { id: string; cardId: string; instanceId: string; sellerId: string; price: number; isFromНексо: boolean; createdAt: string; card: NFTCard; }
interface NFTTagListing { id: string; tagId: string; instanceId: string; sellerId: string; price: number; isFromНексо: boolean; createdAt: string; tag: NFTTag; }

const rarityOrder: Record<string, number> = { Common: 0, Rare: 1, Epic: 2, Legendary: 3 };
const rarityColors: Record<string, string> = { Common: 'text-gray-400', Rare: 'text-blue-400', Epic: 'text-purple-400', Legendary: 'text-orange-400' };

const BG_COLORS = [
  { label: 'Красный', value: '#ef4444' }, { label: 'Синий', value: '#3b82f6' },
  { label: 'Зелёный', value: '#10b981' }, { label: 'Фиолетовый', value: '#8b5cf6' },
  { label: 'Оранжевый', value: '#f59e0b' }, { label: 'Розовый', value: '#ec4899' },
  { label: 'Градиент', value: 'gradient' },
];

interface NFTMarketModalProps {
  onClose: () => void;
  embedded?: boolean;
}

export default function NFTMarketModal({ onClose, embedded }: NFTMarketModalProps) {
  const [tab, setTab] = useState<'nexo' | 'p2p'>('nexo');
  const [itemType, setItemType] = useState<'cards' | 'tags'>('cards');
  const [listings, setListings] = useState<NFTListing[]>([]);
  const [tagListings, setTagListings] = useState<NFTTagListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [rarity, setRarity] = useState('');
  const [bgColor, setBgColor] = useState('');
  const [verified, setVerified] = useState<'all' | 'verified' | 'unverified'>('all');
  const [sortBy, setSortBy] = useState<'createdAt' | 'price' | 'rarity' | 'serialNumber'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [statsItemId, setStatsItemId] = useState<string | null>(null);
  const [statsItemType, setStatsItemType] = useState<'card' | 'tag'>('card');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedListing, setSelectedListing] = useState<{ id: string; price: number; name: string } | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [showTagPaymentModal, setShowTagPaymentModal] = useState(false);
  const [selectedTagListing, setSelectedTagListing] = useState<{ id: string; price: number; name: string } | null>(null);
  const [purchasingTag, setPurchasingTag] = useState(false);

  const { user } = useAuthStore();
  const { success, error } = useToastStore();

  useEffect(() => { load(); }, [tab, itemType, search, minPrice, maxPrice, rarity, bgColor, verified, sortBy, sortOrder]);

  const load = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('isFromНексо', tab === 'nexo' ? 'true' : 'false');
      if (minPrice) params.append('minPrice', minPrice);
      if (maxPrice) params.append('maxPrice', maxPrice);
      if (rarity) params.append('rarity', rarity);
      if (verified !== 'all') params.append('verified', verified);

      if (itemType === 'cards') {
        if (search) params.append('search', search);
        let data = await api.get<NFTListing[]>(`/nft/market?${params}`) || [];
        if (bgColor) {
          data = data.filter((l: NFTListing) => {
            if (bgColor === 'gradient') return !!l.card.gradientColors;
            return l.card.backgroundColor?.toLowerCase().includes(bgColor.toLowerCase());
          });
        }
        data.sort((a: NFTListing, b: NFTListing) => {
          if (sortBy === 'price') return sortOrder === 'asc' ? a.price - b.price : b.price - a.price;
          if (sortBy === 'rarity') return sortOrder === 'asc' ? rarityOrder[a.card.rarity] - rarityOrder[b.card.rarity] : rarityOrder[b.card.rarity] - rarityOrder[a.card.rarity];
          if (sortBy === 'serialNumber') return sortOrder === 'asc' ? a.card.currentSupply - b.card.currentSupply : b.card.currentSupply - a.card.currentSupply;
          return sortOrder === 'asc' ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        setListings(data);
      } else {
        let data = await api.get<NFTTagListing[]>(`/nft/tag-market?${params}`) || [];
        if (search) data = data.filter((l: NFTTagListing) => l.tag.name.toLowerCase().includes(search.toLowerCase()));
        if (sortBy === 'price') data.sort((a: NFTTagListing, b: NFTTagListing) => sortOrder === 'asc' ? a.price - b.price : b.price - a.price);
        if (sortBy === 'rarity') data.sort((a: NFTTagListing, b: NFTTagListing) => sortOrder === 'asc' ? rarityOrder[a.tag.rarity] - rarityOrder[b.tag.rarity] : rarityOrder[b.tag.rarity] - rarityOrder[a.tag.rarity]);
        setTagListings(data);
      }
    } catch { error('Не удалось загрузить маркет'); }
    finally { setLoading(false); }
  };

  const handleBuyCard = (listingId: string, price: number, name: string) => {
    setSelectedListing({ id: listingId, price, name });
    setShowPaymentModal(true);
  };

  const confirmPurchase = async () => {
    if (!selectedListing) return;
    setPurchasing(true);
    try {
      const result = await api.post(`/nft/market/${selectedListing.id}/buy`);
      if (result.newBalance !== undefined) useAuthStore.getState().updateUser({ beavers: result.newBalance });
      success('NFT куплена! ✨');
      setShowPaymentModal(false);
      setSelectedListing(null);
      load();
    } catch (e: any) { error(e.response?.data?.error || 'Ошибка при покупке'); }
    finally { setPurchasing(false); }
  };

  const handleBuyTag = (listingId: string, price: number, name: string) => {
    setSelectedTagListing({ id: listingId, price, name });
    setShowTagPaymentModal(true);
  };

  const confirmTagPurchase = async () => {
    if (!selectedTagListing) return;
    setPurchasingTag(true);
    try {
      const result = await api.post(`/nft/tag-market/${selectedTagListing.id}/buy`);
      if (result.newBalance !== undefined) useAuthStore.getState().updateUser({ beavers: result.newBalance });
      success('Тег куплен! ✨');
      setShowTagPaymentModal(false);
      setSelectedTagListing(null);
      load();
    } catch (e: any) { error(e.response?.data?.error || 'Ошибка при покупке'); }
    finally { setPurchasingTag(false); }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className={embedded ? 'flex flex-col h-full w-full overflow-hidden bg-[#1a1a1a]' : 'fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex'}
      onClick={embedded ? undefined : onClose}
    >
      <motion.div
        initial={embedded ? false : { x: -400, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={embedded ? undefined : { x: -400, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className={embedded
          ? 'flex flex-col h-full w-full overflow-hidden'
          : 'bg-[#0a0a0f]/95 backdrop-blur-3xl border-r border-white/[0.12] w-full sm:w-[420px] h-full overflow-hidden shadow-2xl flex flex-col'
        }
        onClick={embedded ? undefined : e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-white/[0.06] flex-shrink-0 bg-white/[0.02] px-4 h-14">
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-all flex-shrink-0">
            {embedded ? <ArrowLeft size={18} /> : <X size={18} />}
          </button>
          <div className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0">
            <Store size={15} className="text-purple-400" />
          </div>
          <h3 className="text-sm font-semibold text-white flex-1 truncate">NFT Маркет</h3>
          <span className="text-xs text-white/40 flex items-center gap-1 flex-shrink-0">
            {user?.beavers || 0} <BeaverIcon size={12} />
          </span>
        </div>

        {/* Tabs + Search + Filters */}
        <div className="px-3 py-2 border-b border-white/[0.06] space-y-2 flex-shrink-0">
          {/* Tab buttons */}
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setTab('nexo')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all text-xs ${tab === 'nexo' ? 'bg-purple-500 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}>
              <TrendingUp className="w-3 h-3" /> От Нексо
            </button>
            <button onClick={() => setTab('p2p')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all text-xs ${tab === 'p2p' ? 'bg-purple-500 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}>
              <User className="w-3 h-3" /> От пользователей
            </button>
            <div className="w-px bg-white/10 mx-0.5" />
            <button onClick={() => setItemType('cards')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all text-xs ${itemType === 'cards' ? 'bg-blue-500 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}>
              <CheckCircle className="w-3 h-3" /> Карточки
            </button>
            <button onClick={() => setItemType('tags')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all text-xs ${itemType === 'tags' ? 'bg-blue-500 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}>
              <Tag className="w-3 h-3" /> Теги
            </button>
          </div>

          {/* Search + Filter toggle */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Поиск по названию..."
                className="w-full pl-8 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-purple-500 text-xs transition-colors"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-2 rounded-lg font-medium transition-all flex items-center gap-1.5 text-xs ${showFilters ? 'bg-purple-500 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
            >
              <Filter className="w-3.5 h-3.5" /> Фильтры
            </button>
          </div>

          {/* Filters panel */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <div>
                    <label className="block text-xs text-white/50 mb-1">Мин. цена</label>
                    <input type="number" value={minPrice} onChange={e => setMinPrice(e.target.value)} placeholder="0"
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs focus:outline-none focus:border-purple-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-white/50 mb-1">Макс. цена</label>
                    <input type="number" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="∞"
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs focus:outline-none focus:border-purple-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-white/50 mb-1">Редкость</label>
                    <select value={rarity} onChange={e => setRarity(e.target.value)}
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs focus:outline-none focus:border-purple-500">
                      <option value="">Все</option>
                      {['Common', 'Rare', 'Epic', 'Legendary'].map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  {itemType === 'cards' && (
                    <div>
                      <label className="block text-xs text-white/50 mb-1">Цвет фона</label>
                      <select value={bgColor} onChange={e => setBgColor(e.target.value)}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs focus:outline-none focus:border-purple-500">
                        <option value="">Любой</option>
                        {BG_COLORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                  )}
                  {tab === 'p2p' && (
                    <div>
                      <label className="block text-xs text-white/50 mb-1">Продавец</label>
                      <select value={verified} onChange={e => setVerified(e.target.value as any)}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs focus:outline-none focus:border-purple-500">
                        <option value="all">Все</option>
                        <option value="verified">✔️ Верифицированные</option>
                        <option value="unverified">Неверифицированные</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs text-white/50 mb-1">Сортировка</label>
                    <div className="flex gap-1">
                      <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                        className="flex-1 px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-xs focus:outline-none focus:border-purple-500">
                        <option value="createdAt">Дата</option>
                        <option value="price">Цена</option>
                        <option value="rarity">Редкость</option>
                        <option value="serialNumber">Номер</option>
                      </select>
                      <button
                        onClick={() => setSortOrder(s => s === 'asc' ? 'desc' : 'asc')}
                        className="px-2 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 text-sm"
                      >
                        {sortOrder === 'asc' ? '↑' : '↓'}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Listings */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent" />
            </div>
          ) : itemType === 'cards' ? (
            listings.length === 0 ? (
              <div className="text-center py-20 text-white/40">Нет объявлений</div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {listings.map(listing => (
                  <motion.div
                    key={listing.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="group relative bg-white/5 rounded-xl overflow-hidden hover:bg-white/8 transition-all border border-white/10 hover:border-white/20 flex gap-3 p-3"
                  >
                    {/* Preview */}
                    <div className="relative w-16 h-20 flex-shrink-0 rounded-lg overflow-hidden">
                      <NFTCardPreview card={listing.card} />
                      {listing.isFromНексо && (
                        <div className="absolute top-1 left-1 bg-purple-500 text-white text-[9px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow">
                          <CheckCircle className="w-2.5 h-2.5" /> Нексо
                        </div>
                      )}
                      {listing.card.currentSupply >= listing.card.totalSupply && (
                        <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-lg">
                          <span className="text-red-400 font-bold text-[10px]">SOLD OUT</span>
                        </div>
                      )}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <div className="font-semibold text-sm truncate text-white">{listing.card.name}</div>
                        <div className={`text-[10px] font-medium ${rarityColors[listing.card.rarity]}`}>{listing.card.rarity}</div>
                        <div className="text-[10px] text-white/40">{listing.card.currentSupply}/{listing.card.totalSupply}</div>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm font-bold text-purple-400 flex items-center gap-1">{listing.price} <BeaverIcon size={12} /></span>
                        <button
                          onClick={() => handleBuyCard(listing.id, listing.price, listing.card.name)}
                          disabled={listing.card.currentSupply >= listing.card.totalSupply}
                          className="ml-auto px-3 py-1 bg-purple-500 hover:bg-purple-600 rounded-lg font-medium transition-all disabled:opacity-40 text-xs flex items-center gap-1"
                        >
                          <ShoppingCart className="w-3 h-3" /> Купить
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )
          ) : (
            tagListings.length === 0 ? (
              <div className="text-center py-20 text-white/40">Нет объявлений тегов</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {tagListings.map(listing => (
                  <motion.div
                    key={listing.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="group relative bg-gradient-to-br from-white/5 to-white/[0.02] rounded-2xl p-4 hover:from-white/8 hover:to-white/[0.04] transition-all border border-white/10 hover:border-white/20 text-center"
                  >
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setStatsItemId(listing.tag.id);
                        setStatsItemType('tag');
                        setShowStatsModal(true);
                      }}
                      className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white/60 hover:text-white hover:bg-black/80 transition-all opacity-0 group-hover:opacity-100"
                    >
                      <HelpCircle size={14} />
                    </button>
                    <div className="relative w-16 h-16 mx-auto mb-3">
                      <div
                        className="w-16 h-16 rounded-full flex items-center justify-center text-2xl shadow-lg"
                        style={{ background: listing.tag.backgroundColor || '#333', boxShadow: listing.tag.glowColor ? `0 0 20px ${listing.tag.glowColor}` : 'none' }}
                      >
                        {listing.tag.iconUrl}
                      </div>
                      {listing.isFromНексо && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center shadow-lg">
                          <CheckCircle className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="font-medium text-sm mb-1 text-white">{listing.tag.name}</div>
                    <div className={`text-xs mb-1 ${rarityColors[listing.tag.rarity] || 'text-gray-400'}`}>{listing.tag.rarity}</div>
                    <div className="text-xs text-white/40 mb-3">{listing.tag.currentSupply}/{listing.tag.totalSupply}</div>
                    <div className="space-y-2">
                      <div className="bg-black/40 rounded-xl px-3 py-2 flex items-center justify-center gap-1.5">
                        <span className="text-lg font-bold text-purple-400">{listing.price}</span>
                        <BeaverIcon size={16} />
                      </div>
                      <button
                        onClick={() => handleBuyTag(listing.id, listing.price, listing.tag.name)}
                        disabled={listing.tag.currentSupply >= listing.tag.totalSupply}
                        className="w-full py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-xl font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-1"
                      >
                        <ShoppingCart className="w-3 h-3" /> Купить
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )
          )}
        </div>
      </motion.div>

      {/* Stats Modal */}
      <AnimatePresence>
        {showStatsModal && statsItemId && (
          <NFTStatsModal
            itemId={statsItemId}
            itemType={statsItemType}
            onClose={() => { setShowStatsModal(false); setStatsItemId(null); }}
          />
        )}
      </AnimatePresence>

      {/* Payment Modals */}
      <AnimatePresence>
        {showPaymentModal && selectedListing && (
          <BeaverPaymentModal
            title="Покупка NFT карточки"
            description={`Вы покупаете карточку "${selectedListing.name}"`}
            amount={selectedListing.price}
            onConfirm={confirmPurchase}
            onCancel={() => { setShowPaymentModal(false); setSelectedListing(null); }}
            loading={purchasing}
          />
        )}
        {showTagPaymentModal && selectedTagListing && (
          <BeaverPaymentModal
            title="Покупка NFT тега"
            description={`Вы покупаете тег "${selectedTagListing.name}"`}
            amount={selectedTagListing.price}
            onConfirm={confirmTagPurchase}
            onCancel={() => { setShowTagPaymentModal(false); setSelectedTagListing(null); }}
            loading={purchasingTag}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}