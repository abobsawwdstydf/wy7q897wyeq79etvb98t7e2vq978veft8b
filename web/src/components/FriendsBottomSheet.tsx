import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, useMotionValue, AnimatePresence, type PanInfo } from 'framer-motion';
import { Users, X } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { api } from '../lib/api';
import Avatar from './Avatar';
import type { FriendWithId, FriendRequest } from '../lib/types';

type FriendsTab = 'list' | 'requests' | 'search';

interface FriendsBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  isMobile: boolean;
}

const COLLAPSED_RATIO = 0.28;
const FULL_RATIO = 0.94;

export default function FriendsBottomSheet({ isOpen, onClose, isMobile }: FriendsBottomSheetProps) {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<FriendsTab>('list');
  const [friends, setFriends] = useState<FriendWithId[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const dragY = useMotionValue(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const loadFriends = useCallback(() => {
    api.getFriends()
      .then((data: any) => setFriends(data.map((f: any) => ({ ...f.friend, friendshipId: f.id }))))
      .catch(console.error);
  }, []);

  const loadRequests = useCallback(() => {
    Promise.all([api.getFriendRequests(), api.getOutgoingRequests()])
      .then(([incoming, outgoing]) => {
        setIncomingRequests(incoming || []);
        setOutgoingRequests(outgoing || []);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    loadFriends();
    loadRequests();
  }, [isOpen, loadFriends, loadRequests]);

  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const results = await api.searchUsers(searchQuery);
        const friendIds = new Set(friends.map(f => f.id));
        setSearchResults(results.filter(u => u.id !== user?.id && !friendIds.has(u.id)));
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, friends, user]);

  const sendRequest = async (userId: string) => {
    try {
      await api.sendFriendRequest(userId);
      loadRequests();
      setSearchResults(prev => prev.filter(u => u.id !== userId));
    } catch (e) { console.error(e); }
  };

  const acceptRequest = async (requestId: string) => {
    try {
      await api.acceptFriendRequest(requestId);
      loadFriends();
      loadRequests();
    } catch (e) { console.error(e); }
  };

  const declineRequest = async (requestId: string) => {
    try { await api.declineFriendRequest(requestId); loadRequests(); } catch (e) { console.error(e); }
  };

  const removeFriend = async (friendId: string) => {
    try { await api.removeFriend(friendId); loadFriends(); } catch (e) { console.error(e); }
  };

  const cancelOutgoing = async (requestId: string) => {
    try { await api.declineFriendRequest(requestId); loadRequests(); } catch (e) { console.error(e); }
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    const velocity = info.velocity.y;
    const offset = info.offset.y;
    if (isExpanded) {
      if (offset > 120 || velocity > 500) {
        setIsExpanded(false);
      }
    } else {
      if (offset < -120 || velocity < -500) {
        setIsExpanded(true);
      } else if (offset > 200 || velocity > 800) {
        onClose();
      }
    }
    dragY.set(0);
  };

  if (!isMobile) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm sm:hidden"
            onClick={onClose}
          />
          <motion.div
            ref={sheetRef}
            initial={{ y: '100%' }}
            animate={{
              y: isExpanded ? `${(1 - FULL_RATIO) * 100}%` : `${(1 - COLLAPSED_RATIO) * 100}%`,
            }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.15}
            onDragEnd={handleDragEnd}
            style={{ y: dragY }}
            className="fixed inset-x-0 bottom-0 z-[75] sm:hidden glass-strong rounded-t-3xl shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="flex-shrink-0 pt-2 pb-3 px-4 select-none cursor-grab active:cursor-grabbing">
              <div className="mx-auto w-12 h-1.5 rounded-full bg-white/20" />
            </div>

            <div className="flex-shrink-0 px-4 pb-2 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-nexo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-nexo-500/30">
                  <Users size={15} className="text-white" />
                </div>
                <h2 className="text-base font-bold text-white">Друзья</h2>
                {friends.length > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-white/10 text-[10px] font-bold flex items-center justify-center text-zinc-300">
                    {friends.length > 99 ? '99+' : friends.length}
                  </span>
                )}
              </div>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-all"
                aria-label="Закрыть"
              >
                <X size={16} />
              </motion.button>
            </div>

            <div className="flex-shrink-0 px-4 pb-2">
              <div className="flex gap-1 p-1 rounded-2xl glass-subtle">
                {([
                  { key: 'list', label: 'Друзья', count: friends.length },
                  { key: 'requests', label: 'Запросы', count: incomingRequests.length + outgoingRequests.length },
                  { key: 'search', label: 'Поиск', count: 0 },
                ] as { key: FriendsTab; label: string; count: number }[]).map((tab) => (
                  <motion.button
                    key={tab.key}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 py-1.5 px-3 rounded-xl text-[11px] font-medium transition-all flex items-center justify-center gap-1.5 ${
                      activeTab === tab.key
                        ? 'glass-tab-active text-white'
                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {tab.label}
                    {tab.count > 0 && (
                      <span className={`min-w-[14px] h-[14px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center ${
                        activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-nexo-500 text-white'
                      }`}>
                        {tab.count > 99 ? '99+' : tab.count}
                      </span>
                    )}
                  </motion.button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-[max(20px,env(safe-area-inset-bottom))]">
              {activeTab === 'list' && (
                <div className="space-y-1 pt-1">
                  {friends.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-2 text-zinc-500">
                      <div className="w-12 h-12 rounded-full glass-subtle flex items-center justify-center">
                        <Users size={20} className="opacity-40" />
                      </div>
                      <p className="text-xs">Список друзей пуст</p>
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setActiveTab('search')}
                        className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-nexo-400 transition-all"
                      >
                        Найти друзей
                      </motion.button>
                    </div>
                  ) : (
                    friends.map(friend => (
                      <div key={friend.id} className="flex items-center gap-2.5 p-2 rounded-2xl glass-subtle">
                        <div className="relative">
                          <Avatar
                            src={friend.avatar}
                            name={friend.displayName || friend.username}
                            size="sm"
                            isVerified={friend.isVerified}
                            verifiedBadgeUrl={friend.verifiedBadgeUrl}
                            verifiedBadgeType={friend.verifiedBadgeType}
                          />
                          {friend.isOnline && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-[#0a0a0f]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-white truncate">{friend.displayName || friend.username}</p>
                          <p className="text-[10px] text-zinc-500">@{friend.username}</p>
                        </div>
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={() => removeFriend(friend.id)}
                          className="w-7 h-7 rounded-lg bg-white/5 hover:bg-red-500/20 flex items-center justify-center text-zinc-500 hover:text-red-400 transition-all"
                          title="Удалить"
                        >
                          <X size={12} />
                        </motion.button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'requests' && (
                <div className="space-y-3 pt-1">
                  {incomingRequests.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                        Входящие ({incomingRequests.length})
                      </h3>
                      <div className="space-y-1">
                        {incomingRequests.map(req => (
                          <div key={req.id} className="flex items-center gap-2.5 p-2 rounded-2xl glass-subtle">
                            <Avatar
                              src={req.sender?.avatar}
                              name={req.sender?.displayName || req.sender?.username}
                              size="sm"
                              isVerified={req.sender?.isVerified}
                              verifiedBadgeUrl={req.sender?.verifiedBadgeUrl}
                              verifiedBadgeType={req.sender?.verifiedBadgeType}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-white truncate">{req.sender?.displayName || req.sender?.username}</p>
                              <p className="text-[10px] text-zinc-500">@{req.sender?.username}</p>
                            </div>
                            <motion.button
                              whileTap={{ scale: 0.9 }}
                              onClick={() => acceptRequest(req.id)}
                              className="w-7 h-7 rounded-lg bg-green-500/20 hover:bg-green-500/30 flex items-center justify-center text-green-400 transition-all"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                            </motion.button>
                            <motion.button
                              whileTap={{ scale: 0.9 }}
                              onClick={() => declineRequest(req.id)}
                              className="w-7 h-7 rounded-lg bg-red-500/20 hover:bg-red-500/30 flex items-center justify-center text-red-400 transition-all"
                            >
                              <X size={12} />
                            </motion.button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {outgoingRequests.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                        Исходящие ({outgoingRequests.length})
                      </h3>
                      <div className="space-y-1">
                        {outgoingRequests.map(req => (
                          <div key={req.id} className="flex items-center gap-2.5 p-2 rounded-2xl glass-subtle">
                            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-zinc-500 text-[10px]">⏱</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-white truncate">Запрос отправлен</p>
                              <p className="text-[10px] text-zinc-500">Ожидание...</p>
                            </div>
                            <motion.button
                              whileTap={{ scale: 0.9 }}
                              onClick={() => cancelOutgoing(req.id)}
                              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-red-500/20 flex items-center justify-center text-zinc-500 hover:text-red-400 transition-all"
                            >
                              <X size={12} />
                            </motion.button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {incomingRequests.length === 0 && outgoingRequests.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 gap-2 text-zinc-500">
                      <p className="text-xs">Нет запросов</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'search' && (
                <div className="pt-1">
                  <div className="relative mb-3">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Поиск пользователей..."
                      className="w-full pl-3 pr-3 py-2 rounded-xl text-xs text-white placeholder-zinc-500 glass-input"
                    />
                  </div>
                  <div className="space-y-1">
                    {searchResults.map(u => (
                      <div key={u.id} className="flex items-center gap-2.5 p-2 rounded-2xl glass-subtle">
                        <Avatar
                          src={u.avatar}
                          name={u.displayName || u.username}
                          size="sm"
                          isVerified={u.isVerified}
                          verifiedBadgeUrl={u.verifiedBadgeUrl}
                          verifiedBadgeType={u.verifiedBadgeType}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-white truncate">{u.displayName || u.username}</p>
                          <p className="text-[10px] text-zinc-500">@{u.username}</p>
                        </div>
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={() => sendRequest(u.id)}
                          className="px-2 py-1 rounded-lg bg-nexo-500/20 hover:bg-nexo-500/30 text-[10px] text-nexo-300 font-medium transition-all"
                        >
                          Добавить
                        </motion.button>
                      </div>
                    ))}
                    {searchQuery.length >= 2 && searchResults.length === 0 && !isLoading && (
                      <p className="text-center text-xs text-zinc-500 py-4">Не найдено</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
