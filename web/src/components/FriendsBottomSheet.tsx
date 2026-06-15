import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, useMotionValue, AnimatePresence, type PanInfo } from 'framer-motion';
import { Users } from 'lucide-react';
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
      if (offset > 100 || velocity > 400) {
        setIsExpanded(false);
      }
    } else {
      if (offset < -80 || velocity < -400) {
        setIsExpanded(true);
      } else if (offset > 150 || velocity > 600) {
        onClose();
      }
    }
    dragY.set(0);
  };

  if (!isMobile) return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm hidden sm:block"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[75] w-full max-w-md max-h-[80vh] hidden sm:flex flex-col overflow-hidden rounded-3xl"
          >
            <div className="absolute -inset-px rounded-3xl bg-gradient-to-br from-nexo-500/30 via-purple-500/15 to-pink-500/20 pointer-events-none opacity-50 blur-sm" />
            <div className="absolute -inset-px rounded-3xl bg-gradient-to-br from-nexo-500/15 via-transparent to-purple-500/10 pointer-events-none" />
            <div className="relative glass-strong rounded-3xl overflow-hidden flex flex-col min-h-0 h-full">
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-nexo-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/8 rounded-full blur-3xl pointer-events-none" />
              <DesktopFriendsContent
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                friends={friends}
                incomingRequests={incomingRequests}
                outgoingRequests={outgoingRequests}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                searchResults={searchResults}
                isLoading={isLoading}
                onClose={onClose}
                acceptRequest={acceptRequest}
                declineRequest={declineRequest}
                removeFriend={removeFriend}
                cancelOutgoing={cancelOutgoing}
                sendRequest={sendRequest}
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

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
            className="fixed inset-x-0 bottom-0 z-[75] sm:hidden flex flex-col overflow-hidden rounded-t-[32px] shadow-[0_-20px_40px_rgba(0,0,0,0.4)]"
          >
            <div className="absolute inset-0 bg-[rgba(11,19,38,0.6)] backdrop-blur-[40px] border border-white/[0.1] border-b-0 rounded-t-[32px]" />

            <div className="relative flex flex-col h-full min-h-0">
              <div className="flex-shrink-0 flex justify-center pt-3 pb-4 cursor-pointer group active:scale-95 transition-transform" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="w-12 h-1.5 bg-white/20 rounded-full group-hover:bg-white/40 transition-colors" />
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
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
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
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
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
                            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-zinc-500 text-[10px]">...</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-white truncate">Запрос отправлен</p>
                              <p className="text-[10px] text-zinc-500">Ожидание...</p>
                            </div>
                            <motion.button
                              whileTap={{ scale: 0.9 }}
                              onClick={() => cancelOutgoing(req.id)}
                              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-red-500/20 flex items-center justify-center text-zinc-500 hover:text-red-400 transition-all"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
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
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function DesktopFriendsContent({
  activeTab, setActiveTab, friends, incomingRequests, outgoingRequests,
  searchQuery, setSearchQuery, searchResults, isLoading, onClose,
  acceptRequest, declineRequest, removeFriend, cancelOutgoing, sendRequest,
}: {
  activeTab: FriendsTab;
  setActiveTab: (t: FriendsTab) => void;
  friends: FriendWithId[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchResults: any[];
  isLoading: boolean;
  onClose: () => void;
  acceptRequest: (id: string) => void;
  declineRequest: (id: string) => void;
  removeFriend: (id: string) => void;
  cancelOutgoing: (id: string) => void;
  sendRequest: (id: string) => void;
}) {
  const tabs = [
    { key: 'list' as FriendsTab, label: 'Друзья', count: friends.length },
    { key: 'requests' as FriendsTab, label: 'Запросы', count: incomingRequests.length + outgoingRequests.length },
    { key: 'search' as FriendsTab, label: 'Поиск', count: 0 },
  ];

  return (
    <>
      <div className="relative flex items-center justify-between px-5 py-4 border-b border-white/[0.06] flex-shrink-0">
        <div className="absolute inset-0 bg-gradient-to-r from-nexo-500/5 via-transparent to-purple-500/5 pointer-events-none" />
        <div className="flex items-center gap-2.5 relative z-10">
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
      </div>

      <div className="relative px-4 pt-3 pb-2 flex-shrink-0">
        <div className="flex gap-1 p-1 rounded-2xl glass-subtle">
          {tabs.map((tab) => (
            <motion.button
              key={tab.key}
              whileTap={{ scale: 0.96 }}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
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

      <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
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
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
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
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
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
                      <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-zinc-500 text-[10px]">...</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white truncate">Запрос отправлен</p>
                        <p className="text-[10px] text-zinc-500">Ожидание...</p>
                      </div>
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => cancelOutgoing(req.id)}
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-red-500/20 flex items-center justify-center text-zinc-500 hover:text-red-400 transition-all"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
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
    </>
  );
}
