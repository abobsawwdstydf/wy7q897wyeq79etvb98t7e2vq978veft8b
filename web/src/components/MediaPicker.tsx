import { useState, useEffect, useRef, useCallback } from 'react';
import type React from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Smile, Package, Image, Search, Plus, ChevronLeft, Upload, Trash2, Globe, Lock, Check, X } from 'lucide-react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { useLang } from '../lib/i18n';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

interface Sticker {
  id: string;
  packId: string;
  emoji: string;
  fileUrl: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  isAnimated: boolean;
  order: number;
}

interface StickerPack {
  id: string;
  name: string;
  description: string | null;
  creatorId: string;
  thumbnail: string | null;
  isPublic: boolean;
  isAnimated: boolean;
  createdAt: string;
  stickers: Sticker[];
}

interface GifItem {
  id: string;
  url: string;
  title: string;
  width: number;
  height: number;
  previewUrl?: string;
}

interface MediaPickerProps {
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
  onSendSticker: (sticker: Sticker) => void;
  onSendGif: (gif: GifItem) => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
}

type Tab = 'emoji' | 'stickers' | 'create';
type CreateStep = 'pack' | 'stickers';

export default function MediaPicker({
  onClose,
  onSelectEmoji,
  onSendSticker,
  onSendGif,
  anchorRef,
}: MediaPickerProps) {
  const { lang } = useLang();
  const { user } = useAuthStore();
  const [tab, setTab] = useState<Tab>('emoji');
  const [isMobile, setIsMobile] = useState(false);
  const [pos, setPos] = useState<{ bottom: number; left?: number; right?: number } | null>(null);

  // Stickers state
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [myPacks, setMyPacks] = useState<StickerPack[]>([]);
  const [selectedPack, setSelectedPack] = useState<StickerPack | null>(null);
  const [packStickers, setPackStickers] = useState<Sticker[]>([]);
  const [loadingPacks, setLoadingPacks] = useState(false);
  const [loadingStickers, setLoadingStickers] = useState(false);

  // GIF state
  const [gifQuery, setGifQuery] = useState('');
  const [gifs, setGifs] = useState<GifItem[]>([]);
  const [loadingGifs, setLoadingGifs] = useState(false);
  const gifSearchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Create pack state
  const [createStep, setCreateStep] = useState<CreateStep>('pack');
  const [newPackName, setNewPackName] = useState('');
  const [newPackDesc, setNewPackDesc] = useState('');
  const [newPackPublic, setNewPackPublic] = useState(true);
  const [creatingPack, setCreatingPack] = useState(false);
  const [createdPack, setCreatedPack] = useState<StickerPack | null>(null);
  const [stickerEmoji, setStickerEmoji] = useState('😀');
  const [stickerFile, setStickerFile] = useState<File | null>(null);
  const [stickerPreview, setStickerPreview] = useState<string | null>(null);
  const [addingSticker, setAddingSticker] = useState(false);
  const [createdStickers, setCreatedStickers] = useState<Sticker[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Compute position for desktop - centered above message input
  useEffect(() => {
    if (isMobile) return;
    const update = () => {
      const el = anchorRef?.current ?? document.querySelector('[data-mediapicker-anchor]') as HTMLElement | null;
      if (!el) {
        // fallback: bottom-center of viewport
        setPos({ bottom: 80, right: undefined as any });
        return;
      }
      const rect = el.getBoundingClientRect();
      const pickerW = 360;
      const bottom = window.innerHeight - rect.top + 8;
      // Center horizontally relative to the input area
      const centerX = rect.left + rect.width / 2;
      const right = window.innerWidth - centerX - pickerW / 2;
      setPos({ bottom, right });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [isMobile, anchorRef]);

  // Load sticker packs when tab opens
  useEffect(() => {
    if (tab === 'stickers') loadPacks();
  }, [tab]);

  const loadPacks = async () => {
    setLoadingPacks(true);
    try {
      const [publicPacks, userPacks] = await Promise.all([
        api.getStickerPacks(),
        api.getMyStickerPacks(),
      ]);
      setPacks(publicPacks || []);
      setMyPacks(userPacks || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPacks(false);
    }
  };

  const loadPackStickers = async (pack: StickerPack) => {
    setSelectedPack(pack);
    setLoadingStickers(true);
    try {
      const stickers = await api.getPackStickers(pack.id);
      setPackStickers(stickers || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingStickers(false);
    }
  };

  const loadTrendingGifs = async () => {
    setLoadingGifs(true);
    try {
      const d = await api.getTrendingGifs(30);
      setGifs(d || []);
    } catch (e) {
      setGifs([]);
    } finally {
      setLoadingGifs(false);
    }
  };

  const searchGifs = useCallback(async (query: string) => {
    if (!query.trim()) { loadTrendingGifs(); return; }
    setLoadingGifs(true);
    try {
      const d = await api.searchGifs(query);
      setGifs(d || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingGifs(false);
    }
  }, []);

  const handleGifSearch = (q: string) => {
    setGifQuery(q);
    if (gifSearchTimeout.current) clearTimeout(gifSearchTimeout.current);
    gifSearchTimeout.current = setTimeout(() => searchGifs(q), 400);
  };

  const handleCreatePack = async () => {
    if (!newPackName.trim()) return;
    setCreatingPack(true);
    try {
      const pack = await api.createStickerPack({ name: newPackName.trim(), description: newPackDesc.trim() || undefined, isPublic: newPackPublic });
      setCreatedPack(pack);
      setCreatedStickers([]);
      setCreateStep('stickers');
    } catch (e) {
      console.error(e);
    } finally {
      setCreatingPack(false);
    }
  };

  const handleStickerFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStickerFile(file);
    setStickerPreview(URL.createObjectURL(file));
  };

  const handleAddSticker = async () => {
    if (!createdPack || !stickerFile) return;
    setAddingSticker(true);
    try {
      const uploadResult = await api.uploadFile(stickerFile);
      const sticker = await api.addStickerToPack(createdPack.id, {
        emoji: stickerEmoji,
        fileUrl: uploadResult.url,
        isAnimated: stickerFile.type === 'image/gif' || stickerFile.name.endsWith('.tgs'),
      });
      setCreatedStickers(prev => [...prev, sticker]);
      setStickerFile(null);
      setStickerPreview(null);
      setStickerEmoji('😀');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      console.error(e);
    } finally {
      setAddingSticker(false);
    }
  };

  const handleFinishCreating = () => {
    setTab('stickers');
    setCreateStep('pack');
    setNewPackName('');
    setNewPackDesc('');
    setCreatedPack(null);
    setCreatedStickers([]);
    loadPacks();
  };

  const handleDeletePack = async (packId: string) => {
    try {
      await api.deleteStickerPack(packId);
      setMyPacks(prev => prev.filter(p => p.id !== packId));
      setPacks(prev => prev.filter(p => p.id !== packId));
    } catch (e) {
      console.error(e);
    }
  };

  const allPacks = [...myPacks, ...packs.filter(p => !myPacks.find(mp => mp.id === p.id))];

  const pickerContent = (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[9989]" onClick={(e) => {
        e.stopPropagation();
        onClose();
      }} />

      {/* Picker panel */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.15 }}
        onClick={e => {
          e.stopPropagation();
        }}
        style={
          isMobile
            ? { maxHeight: '70vh' } as React.CSSProperties
            : pos
              ? {
                  position: 'fixed' as const,
                  bottom: pos.bottom,
                  ...(pos.left !== undefined ? { left: pos.left } : {}),
                  ...(pos.right !== undefined ? { right: pos.right } : {}),
                  zIndex: 9990,
                  width: 360,
                  maxHeight: 480,
                  transform: pos.left !== undefined ? 'translateX(-50%)' : undefined,
                }
              : { position: 'fixed' as const, bottom: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 9990, width: 360, maxHeight: 480 }
        }
        className={
          isMobile
            ? 'fixed bottom-0 left-0 right-0 z-[9990] bg-[#111113] border-t border-white/10 rounded-t-2xl shadow-2xl flex flex-col'
            : 'bg-[#111113] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden'
        }
      >
        {/* Tabs */}
        <div className="flex items-center border-b border-white/10 px-2 pt-2 gap-0.5 flex-shrink-0">
          <TabBtn active={tab === 'emoji'} onClick={() => setTab('emoji')} color="yellow">
            <Smile size={14} />
            Эмодзи
          </TabBtn>
          <TabBtn active={tab === 'stickers'} onClick={() => { setTab('stickers'); setSelectedPack(null); }} color="nexo">
            <Package size={14} />
            Стикеры
          </TabBtn>
          <TabBtn active={tab === 'create'} onClick={() => setTab('create')} color="green">
            <Plus size={14} />
            Создать
          </TabBtn>
          <div className="flex-1" />
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10 transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className={`flex-1 overflow-hidden flex flex-col min-h-0 ${isMobile ? 'max-h-[60vh]' : 'max-h-[420px]'}`}>

          {/* EMOJI TAB */}
          {tab === 'emoji' && (
            <div className="flex-1 overflow-hidden">
              <Picker
                data={data}
                onEmojiSelect={(e: { native: string }) => { onSelectEmoji(e.native); onClose(); }}
                theme="dark"
                locale={lang === 'ru' ? 'ru' : 'en'}
                set="native"
                previewPosition="none"
                skinTonePosition="search"
                perLine={9}
                emojiSize={28}
                emojiButtonSize={36}
                maxFrequentRows={2}
                navPosition="bottom"
                dynamicWidth={false}
              />
            </div>
          )}

          {/* STICKERS TAB */}
          {tab === 'stickers' && (
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              {selectedPack ? (
                <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 flex-shrink-0">
                    <button onClick={() => setSelectedPack(null)} className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-sm font-medium text-white flex-1 truncate">{selectedPack.name}</span>
                    {selectedPack.creatorId === user?.id && (
                      <button onClick={() => handleDeletePack(selectedPack.id)} className="p-1 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto p-2">
                    {loadingStickers ? (
                      <Spinner />
                    ) : packStickers.length === 0 ? (
                      <Empty icon={<Package size={28} />} text="Стикеры не найдены" />
                    ) : (
                      <div className="grid grid-cols-5 gap-1">
                        {packStickers.map(sticker => (
                          <button
                            key={sticker.id}
                            onClick={() => { onSendSticker(sticker); onClose(); }}
                            className="aspect-square p-1 rounded-xl hover:bg-white/10 transition-colors flex items-center justify-center"
                            title={sticker.emoji}
                          >
                            <img src={sticker.fileUrl} alt={sticker.emoji} className="w-full h-full object-contain" loading="lazy" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-3">
                  {loadingPacks ? (
                    <Spinner />
                  ) : allPacks.length === 0 ? (
                    <Empty icon={<Package size={28} />} text="Нет стикер-паков">
                      <button onClick={() => setTab('create')} className="mt-2 text-xs text-nexo-400 hover:underline">Создать первый пак</button>
                    </Empty>
                  ) : (
                    <div className="space-y-1">
                      {myPacks.length > 0 && <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide mb-1">Мои паки</p>}
                      {myPacks.map(pack => (
                        <StickerPackRow key={pack.id} pack={pack} isMine onClick={() => loadPackStickers(pack)} onDelete={() => handleDeletePack(pack.id)} />
                      ))}
                      {packs.filter(p => !myPacks.find(mp => mp.id === p.id)).length > 0 && (
                        <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide mt-3 mb-1">Публичные паки</p>
                      )}
                      {packs.filter(p => !myPacks.find(mp => mp.id === p.id)).map(pack => (
                        <StickerPackRow key={pack.id} pack={pack} isMine={false} onClick={() => loadPackStickers(pack)} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* CREATE TAB */}
          {tab === 'create' && (
            <div className="flex-1 overflow-y-auto p-4">
              {createStep === 'pack' ? (
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-0.5">Создать стикер-пак</h3>
                    <p className="text-xs text-zinc-500">Загрузи свои стикеры и поделись ими</p>
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400 mb-1 block">Название *</label>
                    <input type="text" value={newPackName} onChange={e => setNewPackName(e.target.value)} placeholder="Мои стикеры" maxLength={50}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-nexo-500/50" />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400 mb-1 block">Описание</label>
                    <input type="text" value={newPackDesc} onChange={e => setNewPackDesc(e.target.value)} placeholder="Необязательно" maxLength={200}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-nexo-500/50" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setNewPackPublic(true)} className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all text-xs ${newPackPublic ? 'bg-nexo-500/20 border-nexo-500 text-white' : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'}`}>
                      <Globe size={14} /><span>Публичный</span>{newPackPublic && <Check size={12} className="ml-auto text-nexo-400" />}
                    </button>
                    <button onClick={() => setNewPackPublic(false)} className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all text-xs ${!newPackPublic ? 'bg-nexo-500/20 border-nexo-500 text-white' : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'}`}>
                      <Lock size={14} /><span>Приватный</span>{!newPackPublic && <Check size={12} className="ml-auto text-nexo-400" />}
                    </button>
                  </div>
                  <button onClick={handleCreatePack} disabled={!newPackName.trim() || creatingPack}
                    className="w-full py-2.5 rounded-xl bg-nexo-500 text-white text-sm font-medium hover:bg-nexo-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                    {creatingPack ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Plus size={16} />Создать пак</>}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setCreateStep('pack')} className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"><ChevronLeft size={16} /></button>
                    <div>
                      <h3 className="text-sm font-semibold text-white">{createdPack?.name}</h3>
                      <p className="text-xs text-zinc-500">Добавь стикеры в пак</p>
                    </div>
                  </div>
                  {createdStickers.length > 0 && (
                    <div>
                      <p className="text-xs text-zinc-400 mb-1">Добавлено: {createdStickers.length}</p>
                      <div className="grid grid-cols-5 gap-1">
                        {createdStickers.map(s => (
                          <div key={s.id} className="aspect-square p-1 rounded-xl bg-white/5 flex items-center justify-center">
                            <img src={s.fileUrl} alt={s.emoji} className="w-full h-full object-contain" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="bg-white/5 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-medium text-zinc-300">Добавить стикер</p>
                    <input ref={fileInputRef} type="file" accept="image/png,image/gif,image/webp" onChange={handleStickerFileChange} className="hidden" />
                    {stickerPreview ? (
                      <div className="relative w-16 h-16 mx-auto">
                        <img src={stickerPreview} alt="preview" className="w-full h-full object-contain rounded-xl" />
                        <button onClick={() => { setStickerFile(null); setStickerPreview(null); }} className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center"><X size={10} className="text-white" /></button>
                      </div>
                    ) : (
                      <button onClick={() => fileInputRef.current?.click()} className="w-full h-16 border-2 border-dashed border-white/20 rounded-xl flex flex-col items-center justify-center gap-1 text-zinc-500 hover:border-nexo-500/50 hover:text-nexo-400 transition-colors">
                        <Upload size={18} /><span className="text-xs">PNG, GIF, WebP</span>
                      </button>
                    )}
                    <input type="text" value={stickerEmoji} onChange={e => setStickerEmoji(e.target.value)} placeholder="😀"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none" />
                    <button onClick={handleAddSticker} disabled={!stickerFile || addingSticker}
                      className="w-full py-1.5 rounded-xl bg-nexo-500/20 border border-nexo-500/30 text-nexo-400 text-xs font-medium hover:bg-nexo-500/30 disabled:opacity-50 transition-colors flex items-center justify-center gap-1">
                      {addingSticker ? <div className="w-3 h-3 border-2 border-nexo-400 border-t-transparent rounded-full animate-spin" /> : <><Plus size={12} />Добавить стикер</>}
                    </button>
                  </div>
                  <button onClick={handleFinishCreating} className="w-full py-2.5 rounded-xl bg-nexo-500 text-white text-sm font-medium hover:bg-nexo-600 transition-colors flex items-center justify-center gap-2">
                    <Check size={16} />Готово ({createdStickers.length} стикеров)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </>
  );

  return isMobile
    ? createPortal(pickerContent, document.body)
    : createPortal(pickerContent, document.body);
}

function TabBtn({ active, onClick, color, children }: { active: boolean; onClick: () => void; color: string; children: React.ReactNode }) {
  const colorMap: Record<string, string> = {
    yellow: 'text-yellow-400 border-yellow-500',
    nexo: 'text-nexo-400 border-nexo-500',
    pink: 'text-pink-400 border-pink-500',
    green: 'text-emerald-400 border-emerald-500',
  };
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2.5 py-2 text-xs font-medium transition-colors ${
        active ? `${colorMap[color]} border-b-2` : 'text-zinc-400 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center h-24">
      <div className="w-6 h-6 border-2 border-nexo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function Empty({ icon, text, children }: { icon: React.ReactNode; text: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center h-24 text-zinc-500 gap-2">
      <div className="opacity-40">{icon}</div>
      <p className="text-sm">{text}</p>
      {children}
    </div>
  );
}

function StickerPackRow({ pack, isMine, onClick, onDelete }: { pack: StickerPack; isMine: boolean; onClick: () => void; onDelete?: () => void }) {
  const thumbnail = pack.stickers?.[0]?.fileUrl || pack.thumbnail;
  return (
    <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors group">
      <button onClick={onClick} className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {thumbnail ? <img src={thumbnail} alt={pack.name} className="w-full h-full object-contain p-1" /> : <Package size={18} className="text-zinc-500" />}
        </div>
        <div className="min-w-0 text-left">
          <p className="text-sm font-medium text-white truncate">{pack.name}</p>
          <p className="text-xs text-zinc-500 truncate">{pack.description || (isMine ? 'Мой пак' : 'Публичный пак')}</p>
        </div>
      </button>
      {isMine && onDelete && (
        <button onClick={e => { e.stopPropagation(); onDelete(); }} className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}
