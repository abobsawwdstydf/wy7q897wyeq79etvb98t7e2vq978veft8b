import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, AtSign, Edit3, Check, Loader2, Image as ImageIcon, FileText, Link as LinkIcon, Download, ExternalLink, Play, UserPlus, UserMinus, UserCheck, Clock, PhoneIncoming, PhoneOutgoing, PhoneMissed, Pin, Hash, MessageSquare, Lock, Music, Crown, Camera, Newspaper, QrCode, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useLang } from '../lib/i18n';
import { User, Message, FriendshipStatus, Chat } from '../lib/types';
import ImageLightbox from './ImageLightbox';
import { getSocket } from '../lib/socket';
import PinChannelModal from './PinChannelModal';
import { SecretChatModal } from './SecretChatModal';
import { useToastStore } from '../stores/toastStore';
import ProfileMusic from './ProfileMusic';
import NFTProfileBackground from './NFTProfileBackground';
import NFTInventoryModal from './NFTInventoryModal';
import BeaverIcon from './BeaverIcon';
import DatePicker from './DatePicker';
import PremiumBadgeUpload from './PremiumBadgeUpload';
import VerifiedBadge from './VerifiedBadge';
import QRCodeModal from './QRCodeModal';

interface UserProfileProps {
  userId: string;
  chatId?: string;
  onClose: () => void;
  isSelf?: boolean;
}

type MediaTab = 'media' | 'files' | 'links';
type ProfileTab = MediaTab | 'calls' | 'music' | 'nft_gifts' | 'nft_tags' | 'hashtags';

export default function UserProfile({ userId, chatId, onClose, isSelf }: UserProfileProps) {
  const { user: authUser, updateUser } = useAuthStore();
  const isPremium = useAuthStore(state => state.isPremium());
  const { t, lang } = useLang();
  const { success, error: showError } = useToastStore();
  const [profile, setProfile] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProfileTab>('media');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editData, setEditData] = useState({ displayName: '', bio: '', birthday: '', username: '' });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Status state
  const [status, setStatus] = useState<{ text: string; emoji?: string; expiresAt?: string } | null>(null);
  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [statusEmoji, setStatusEmoji] = useState('');
  const [statusExpires, setStatusExpires] = useState('24');

  // Profile music state
  const [isPlayingMusic, setIsPlayingMusic] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Shared media state
  const [sharedMedia, setSharedMedia] = useState<Message[]>([]);
  const [sharedFiles, setSharedFiles] = useState<Message[]>([]);
  const [sharedLinks, setSharedLinks] = useState<Array<Message & { links?: string[] }>>([]);
  const [callHistory, setCallHistory] = useState<Array<{
    id: string;
    type: 'voice' | 'video';
    status: 'completed' | 'missed' | 'declined' | 'failed';
    duration: number;
    createdAt: string;
    isIncoming: boolean;
  }>>([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [loadedTabs, setLoadedTabs] = useState<Set<ProfileTab>>(new Set());
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Friend state
  const [friendStatus, setFriendStatus] = useState<FriendshipStatus | null>(null);
  const [friendLoading, setFriendLoading] = useState(false);

  // Pin channel state
  const [showPinModal, setShowPinModal] = useState(false);

  // Secret chat state
  const [showSecretChatModal, setShowSecretChatModal] = useState(false);

  const [isOpeningChat, setIsOpeningChat] = useState(false);
  const openingChatRef = useRef(false);

  // NFT state
  const [equippedNFTCard, setEquippedNFTCard] = useState<any>(null);
  const [equippedNFTTags, setEquippedNFTTags] = useState<any[]>([]);
  const [profileNFTCards, setProfileNFTCards] = useState<any[]>([]);
  const [profileNFTTags, setProfileNFTTags] = useState<any[]>([]);
  const [showNFTInventory, setShowNFTInventory] = useState(false);

  const [showQRCode, setShowQRCode] = useState(false);

  // Hashtags state
  const [userHashtags, setUserHashtags] = useState<Array<{
    id: string;
    tag: string;
    useCount: number;
    ownerUseCount: number;
    createdAt: string;
  }>>([]);

  useEffect(() => {
    loadProfile();
    loadStatus();
    if (!isSelf) {
      api.getFriendshipStatus(userId).then(setFriendStatus).catch(() => {});
    }
  }, [userId]);

  // Загрузить надетые NFT для профиля
  useEffect(() => {
    api.get<{ card: any; tags: any[] }>(`/nft/equipped/${userId}`).then((data) => {
      setEquippedNFTCard(data?.card?.card || null);
      setEquippedNFTTags(data?.tags || []);
    }).catch(() => {});
  }, [userId]);

  // Загрузить все NFT пользователя для вкладок
  useEffect(() => {
    if (activeTab === 'nft_gifts' || activeTab === 'nft_tags') {
      api.get<{ cards: any[]; tags: any[] }>('/nft/inventory').then((data) => {
        setProfileNFTCards(data?.cards || []);
        setProfileNFTTags(data?.tags || []);
      }).catch(() => {});
    }
  }, [activeTab, userId, isSelf]);

  useEffect(() => {
    if (profile && isEditingProfile) {
      setEditData({
        displayName: profile.displayName || '',
        bio: profile.bio || '',
        birthday: profile.birthday || '',
        username: profile.username || '',
      });
    }
  }, [profile, isEditingProfile]);

  // Load shared media/files/links when tab changes
  const loadTabData = useCallback(async (tab: ProfileTab) => {
    if (loadedTabs.has(tab)) return;
    setTabLoading(true);
    try {
      if (tab === 'calls') {
        if (!chatId) return;
        // Load call history for this user
        const allCalls = await api.getCallHistory(100);
        const userCalls = allCalls.filter(c => 
          c.callerId === userId || c.calleeId === userId
        ).map(c => ({
          id: c.id,
          type: c.type as 'voice' | 'video',
          status: c.status,
          duration: c.duration,
          createdAt: c.createdAt,
          isIncoming: c.calleeId === userId,
        }));
        setCallHistory(userCalls);
      } else if (tab === 'hashtags') {
        // Load user's hashtags
        const hashtags = await api.get('/wall/hashtags/owned');
        setUserHashtags(hashtags);
      } else if (chatId) {
        const data = await api.getSharedMedia(chatId, tab as MediaTab);
        if (tab === 'media') setSharedMedia(data);
        else if (tab === 'files') setSharedFiles(data);
        else setSharedLinks(data);
      }
      setLoadedTabs(prev => new Set(prev).add(tab));
    } catch (e) {
      console.error('Failed to load shared', tab, e);
    } finally {
      setTabLoading(false);
    }
  }, [chatId, loadedTabs, userId]);

  useEffect(() => {
    loadTabData(activeTab);
  }, [activeTab, loadTabData]);

  const loadProfile = async () => {
    try {
      setIsLoading(true);
      if (isSelf && authUser) {
        setProfile(authUser);
      } else {
        const data = await api.getUser(userId);
        setProfile(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      setIsSavingProfile(true);
      const updated = await api.updateProfile(editData);
      setProfile(updated);
      if (isSelf && updateUser) {
        updateUser(updated);
      }
      setIsEditingProfile(false);
    } catch (e) {
      console.error('Failed to update profile:', e);
      showError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAvatarUploadInEdit = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const updated = await api.uploadAvatar(file);
      setProfile(prev => prev ? { ...prev, avatar: updated.avatar } : prev);
      if (isSelf && updateUser) updateUser({ avatar: updated.avatar });
    } catch (err) {
      console.error('Avatar upload failed:', err);
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const loadStatus = async () => {
    try {
      const data = await api.get(`/status/${userId}`);
      setStatus(data);
    } catch (e) {
      console.error('Failed to load status:', e);
    }
  };

  const handleSaveStatus = async () => {
    if (!statusText.trim()) {
      showError('Введите текст статуса');
      return;
    }

    try {
      const data = await api.post('/status', {
        text: statusText.trim(),
        emoji: statusEmoji || null,
        expiresIn: statusExpires ? parseInt(statusExpires) : null
      });
      setStatus(data);
      setIsEditingStatus(false);
      success('Статус обновлён');
    } catch (e) {
      console.error('Failed to save status:', e);
      showError(e instanceof Error ? e.message : 'Ошибка сохранения статуса');
    }
  };

  const handleDeleteStatus = async () => {
    try {
      await api.delete('/status');
      setStatus(null);
      setIsEditingStatus(false);
      success('Статус удалён');
    } catch (e) {
      console.error('Failed to delete status:', e);
      showError(e instanceof Error ? e.message : 'Ошибка удаления статуса');
    }
  };

  const startEditingStatus = () => {
    setStatusText(status?.text || '');
    setStatusEmoji(status?.emoji || '');
    setStatusExpires('24');
    setIsEditingStatus(true);
  };

  const handleSendFriendRequest = async () => {
    try {
      setFriendLoading(true);
      const result = await api.sendFriendRequest(userId);
      if (result.status === 'accepted') {
        setFriendStatus({ status: 'accepted' } as FriendshipStatus);
      } else {
        setFriendStatus({ status: 'pending', direction: 'outgoing' } as FriendshipStatus);
      }
      // Notify via socket
      const socket = getSocket();
      if (socket) socket.emit('friend_request', { friendId: userId });
    } catch (e) {
      console.error(e);
    } finally {
      setFriendLoading(false);
    }
  };

  const handleAcceptFriend = async () => {
    if (!friendStatus?.friendshipId) return;
    try {
      setFriendLoading(true);
      await api.acceptFriendRequest(friendStatus.friendshipId);
      setFriendStatus({ status: 'accepted', friendshipId: friendStatus.friendshipId });
      const socket = getSocket();
      if (socket) socket.emit('friend_accepted', { friendId: userId });
    } catch (e) {
      console.error(e);
    } finally {
      setFriendLoading(false);
    }
  };

  const handleRemoveFriend = async () => {
    if (!friendStatus?.friendshipId) return;
    try {
      setFriendLoading(true);
      await api.removeFriend(friendStatus.friendshipId);
      setFriendStatus({ status: 'none' } as FriendshipStatus);
      const socket = getSocket();
      if (socket) socket.emit('friend_removed', { friendId: userId });
    } catch (e) {
      console.error(e);
    } finally {
      setFriendLoading(false);
    }
  };

  const handleOpenChat = async () => {
    // Prevent multiple simultaneous requests
    if (openingChatRef.current) return;
    openingChatRef.current = true;
    setIsOpeningChat(true);
    
    try {
      const store = useChatStore.getState();
      
      // Double-check with fresh store data
      const currentChats = store.chats;
      const existingChat = currentChats.find(c =>
        c.type === 'personal' && c.members.some(m => m.user.id === userId)
      );

      if (existingChat) {
        store.setActiveChat(existingChat.id);
        store.loadMessages(existingChat.id);
      } else {
        // Small delay to ensure store is synced
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Re-check after delay
        const refreshedChats = useChatStore.getState().chats;
        const stillExisting = refreshedChats.find(c =>
          c.type === 'personal' && c.members.some(m => m.user.id === userId)
        );
        
        if (stillExisting) {
          useChatStore.getState().setActiveChat(stillExisting.id);
          useChatStore.getState().loadMessages(stillExisting.id);
        } else {
          // Create new personal chat
          const chat = await api.createPersonalChat(userId);
          useChatStore.getState().addChat(chat);
          useChatStore.getState().setActiveChat(chat.id);
          useChatStore.getState().loadMessages(chat.id);
        }
      }
      onClose();
    } catch (e) {
      console.error('Failed to open chat:', e);
    } finally {
      openingChatRef.current = false;
      setIsOpeningChat(false);
    }
  };

  const formatCallDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const initials = (profile?.displayName || profile?.username || '??')
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const tabs: { key: ProfileTab; label: string; icon: React.ElementType }[] = [
    { key: 'media', label: t('mediaTab'), icon: ImageIcon },
    { key: 'files', label: t('filesTab'), icon: FileText },
    { key: 'links', label: t('linksTab'), icon: LinkIcon },
    { key: 'calls', label: (t('callsTab') as string) || 'Звонки', icon: PhoneIncoming },
    { key: 'music', label: 'Music', icon: Music },
    { key: 'nft_gifts', label: 'Подарки', icon: Crown },
    { key: 'nft_tags', label: 'Теги', icon: Hash },
    ...(isSelf ? [{ key: 'hashtags' as ProfileTab, label: 'Хэштеги', icon: Hash }] : []),
  ];

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-50"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 50 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300, mass: 0.8 }}
        className="fixed inset-0 sm:inset-auto sm:right-3 sm:top-3 sm:bottom-3 sm:w-[420px] sm:max-w-[calc(100%-24px)] bg-surface-secondary/80 backdrop-blur-2xl shadow-[0_0_120px_rgba(0,0,0,0.6)] border-0 sm:border sm:border-white/5 rounded-none sm:rounded-[2rem] z-50 flex flex-col overflow-hidden"
      >
        {/* Шапка */}
        <div className="flex items-center justify-between p-5 border-b border-white/5 bg-white/5 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-nexo-500/20 to-purple-500/10 pointer-events-none" />
          <h2 className="text-xl font-bold tracking-tight text-white drop-shadow-sm relative z-10">
            {isSelf ? t('myProfile') : t('profileTitle')}
          </h2>
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-black/20 text-zinc-400 hover:text-white hover:bg-white/10 transition-all border border-white/5 relative z-10"
          >
            <X size={18} />
          </motion.button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-nexo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : profile ? (
          <div className="flex-1 overflow-y-auto">
            {/* Аватар */}
            <div className="flex flex-col items-center pt-8 pb-4 px-6 relative overflow-visible">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[240px] h-[240px] bg-nexo-500/10 rounded-full blur-[80px] pointer-events-none" />

              {/* NFT Profile Background */}
              {equippedNFTCard && (
                <NFTProfileBackground card={equippedNFTCard} />
              )}

              <div className="relative group">
                {/* Spinning gradient glow ring — меняется на цвет NFT карточки если надета */}
                {equippedNFTCard ? (() => {
                  // Определить цвет свечения из карточки
                  let glowColors = 'from-purple-500 via-pink-500 to-purple-500';
                  if (equippedNFTCard.borderColor) {
                    const c = equippedNFTCard.borderColor;
                    glowColors = `from-[${c}] via-[${c}99] to-[${c}]`;
                  }
                  return (
                    <>
                      <div className="absolute -inset-2 rounded-full opacity-70 blur-sm animate-[spin_3s_linear_infinite]"
                        style={{
                          background: equippedNFTCard.gradientColors
                            ? `linear-gradient(135deg, ${JSON.parse(equippedNFTCard.gradientColors).join(', ')})`
                            : equippedNFTCard.backgroundColor || '#a855f7',
                        }}
                      />
                      <div className="absolute -inset-1 rounded-full opacity-40 blur"
                        style={{
                          background: equippedNFTCard.borderColor || equippedNFTCard.backgroundColor || '#a855f7',
                          boxShadow: `0 0 30px ${equippedNFTCard.borderColor || equippedNFTCard.backgroundColor || '#a855f7'}`,
                        }}
                      />
                    </>
                  );
                })() : (
                  <div className="absolute -inset-1 bg-gradient-to-r from-accent via-purple-500 to-accent rounded-full opacity-50 blur group-hover:opacity-75 transition duration-500 animate-[spin_4s_linear_infinite]" />
                )}

                <div className="relative">
                  {profile.avatar ? (
                    <img
                      src={profile.avatar}
                      alt=""
                      className="w-32 h-32 rounded-full object-cover ring-4 ring-surface bg-surface"
                    />
                  ) : (
                    <div className="w-32 h-32 rounded-full bg-gradient-to-br from-surface to-surface-secondary flex items-center justify-center text-white font-bold text-4xl ring-4 ring-surface relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-tr from-accent/20 to-purple-500/20" />
                      <span className="relative z-10 text-transparent bg-clip-text bg-gradient-to-br from-white to-zinc-400 drop-shadow-md">{initials}</span>
                    </div>
                  )}
                </div>

                {profile.isOnline && (
                  <div className="absolute bottom-3 right-3 flex items-center justify-center">
                    <div className="absolute w-7 h-7 bg-emerald-500 rounded-full animate-ping opacity-60" />
                    <div className="w-7 h-7 bg-emerald-500 rounded-full border-[5px] border-surface-secondary shadow-[0_0_15px_rgba(16,185,129,0.8)]" />
                  </div>
                )}

                {/* Надетые NFT теги поверх аватара */}
                {equippedNFTTags.length > 0 && (
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                    {equippedNFTTags.map((ti: any) => (
                      <div key={ti.id}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm border-2 border-surface-secondary shadow-lg"
                        style={{
                          background: ti.tag?.backgroundColor || '#333',
                          boxShadow: ti.tag?.glowColor ? `0 0 12px ${ti.tag.glowColor}` : undefined,
                        }}
                        title={ti.tag?.name}
                      >
                        {ti.tag?.iconUrl}
                      </div>
                    ))}
                  </div>
                )}

              </div>

              {/* Имя */}
              <div className="flex items-center gap-2 mt-5 flex-wrap justify-center">
                <h3 className="text-[28px] font-bold text-transparent bg-clip-text bg-gradient-to-b from-white to-white/70 tracking-tight text-center px-4">
                  {profile.displayName || profile.username}
                </h3>
                {/* Verified badge next to name */}
                {profile.isVerified && (
                  <span className="flex-shrink-0 inline-flex items-center justify-center">
                    <VerifiedBadge
                      size="md"
                      verifiedBadgeUrl={profile.verifiedBadgeUrl}
                      verifiedBadgeType={profile.verifiedBadgeType}
                    />
                  </span>
                )}
                {/* НУче badge */}
                {profile.isPremium && (
                  <span className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 shadow-lg shadow-yellow-500/20">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-yellow-400">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                    <span className="text-xs font-bold text-yellow-300">НУче</span>
                  </span>
                )}
                {isSelf && (
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={() => setIsEditingProfile(true)}
                    className="p-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-zinc-400 hover:text-white"
                    title="Редактировать профиль"
                  >
                    <Edit3 size={15} />
                  </motion.button>
                )}
                {isSelf && profile.username && (
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={() => setShowQRCode(true)}
                    className="p-2 rounded-full bg-gradient-to-br from-nexo-500/20 to-purple-500/20 hover:from-nexo-500/30 hover:to-purple-500/30 border border-nexo-500/30 transition-all text-nexo-300 hover:text-white shadow-lg shadow-nexo-500/10"
                    title="Показать QR-код"
                  >
                    <QrCode size={15} />
                  </motion.button>
                )}
              </div>

              {/* User tag */}
              {profile.tagText && (
                <div className="mt-2">
                  <span
                    className="inline-flex items-center text-xs px-3 py-1 rounded-xl font-bold tracking-wide uppercase select-none"
                    style={(() => {
                      const c = profile.tagColor || '#6366f1';
                      const s = profile.tagStyle || 'solid';
                      const hexToRgb = (hex: string) => {
                        const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                        return r ? `${parseInt(r[1], 16)}, ${parseInt(r[2], 16)}, ${parseInt(r[3], 16)}` : '99, 102, 241';
                      };
                      const rgb = hexToRgb(c);
                      switch (s) {
                        case 'outline': return { background: 'transparent', border: `1.5px solid ${c}`, color: c };
                        case 'gradient': return { background: `linear-gradient(135deg, ${c}, ${c}aa)`, color: '#fff', border: 'none', boxShadow: `0 2px 12px rgba(${rgb}, 0.3)` };
                        case 'glow': return { background: `rgba(${rgb}, 0.15)`, border: `1.5px solid rgba(${rgb}, 0.6)`, color: c, boxShadow: `0 0 12px rgba(${rgb}, 0.5), inset 0 0 8px rgba(${rgb}, 0.1)` };
                        default: return { background: c, color: '#fff', border: 'none', boxShadow: `0 2px 8px rgba(${rgb}, 0.4)` };
                      }
                    })()}
                  >
                    {profile.tagText}
                  </span>
                </div>
              )}

              {/* Username */}
              <div className="flex items-center gap-2 mt-2.5 bg-nexo-500/10 hover:bg-nexo-500/20 transition-colors px-4 py-2 rounded-full border border-nexo-500/20 backdrop-blur-sm">
                <div className="flex items-center gap-1.5 flex-1">
                  <AtSign size={14} className="text-nexo-400" />
                  <span className="text-sm font-semibold text-nexo-100">{profile.username}</span>
                </div>
                <button
                  onClick={() => {
                    const link = `${window.location.origin}/?user=${profile.username}`;
                    navigator.clipboard.writeText(link);
                    success('Ссылка на профиль скопирована!');
                  }}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-zinc-400 hover:text-white"
                  title="Копировать ссылку"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                </button>
              </div>

              {/* Subscribers count */}
              {profile.subscribersCount !== undefined && profile.subscribersCount > 0 && (
                <div className="mt-2 flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
                  <Users size={14} className="text-nexo-400" />
                  <span className="text-sm font-semibold text-white">
                    {profile.subscribersCount} {profile.subscribersCount === 1 ? 'подписчик' : profile.subscribersCount < 5 ? 'подписчика' : 'подписчиков'}
                  </span>
                </div>
              )}

              {/* Онлайн статус */}
              <p className="text-xs font-semibold uppercase tracking-widest mt-4">
                {profile.isOnline ? (
                  <span className="text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                    {t('online')}
                  </span>
                ) : (
                  <span className="text-zinc-500 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full" />
                    {t('wasRecently')}
                  </span>
                )}
              </p>

              {/* Action Buttons (for other users only) */}
              {!isSelf && (
                <div className="mt-5 flex flex-col gap-2.5 w-full max-w-xs mx-auto">
                  {/* Message button */}
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleOpenChat}
                    disabled={isOpeningChat}
                    className="flex items-center justify-center gap-2.5 px-6 py-3 rounded-2xl bg-gradient-to-r from-nexo-500/90 to-nexo-600/90 hover:from-nexo-500 hover:to-nexo-600 text-white transition-all text-sm font-semibold shadow-lg shadow-nexo-500/30 border border-white/10 backdrop-blur-sm"
                  >
                    {isOpeningChat ? <Loader2 size={18} className="animate-spin" /> : <MessageSquare size={18} />}
                    {t('sendMessage') || 'Написать сообщение'}
                  </motion.button>

                  {/* Secret Chat button */}
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setShowSecretChatModal(true)}
                    className="flex items-center justify-center gap-2.5 px-6 py-3 rounded-2xl bg-gradient-to-r from-purple-600/80 to-pink-600/80 hover:from-purple-600/95 hover:to-pink-600/95 text-white transition-all text-sm font-semibold shadow-lg shadow-purple-500/25 border border-white/10 backdrop-blur-sm"
                  >
                    <Lock size={18} />
                    Секретный чат
                  </motion.button>

                  {/* Friend button */}
                  {friendStatus && (
                    <div className="pt-0.5">
                      {friendStatus.status === 'none' && (
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={handleSendFriendRequest}
                          disabled={friendLoading}
                          className="w-full flex items-center justify-center gap-2.5 px-6 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all text-sm font-semibold backdrop-blur-sm"
                        >
                          {friendLoading ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
                          {t('addFriend')}
                        </motion.button>
                      )}
                      {friendStatus.status === 'pending' && friendStatus.direction === 'outgoing' && (
                        <div className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm font-medium backdrop-blur-sm">
                          <Clock size={16} />
                          {t('requestSent')}
                        </div>
                      )}
                      {friendStatus.status === 'pending' && friendStatus.direction === 'incoming' && (
                        <div className="flex gap-2">
                          <motion.button
                            whileTap={{ scale: 0.97 }}
                            onClick={handleAcceptFriend}
                            disabled={friendLoading}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-green-500/15 hover:bg-green-500/25 border border-green-500/25 text-green-400 transition-all text-sm font-semibold backdrop-blur-sm"
                          >
                            {friendLoading ? <Loader2 size={18} className="animate-spin" /> : <UserCheck size={18} />}
                            {t('accept')}
                          </motion.button>
                          <motion.button
                            whileTap={{ scale: 0.97 }}
                            onClick={handleRemoveFriend}
                            disabled={friendLoading}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 transition-all text-sm font-semibold backdrop-blur-sm"
                          >
                            {t('decline')}
                          </motion.button>
                        </div>
                      )}
                      {friendStatus.status === 'accepted' && (
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={handleRemoveFriend}
                          disabled={friendLoading}
                          className="w-full flex items-center justify-center gap-2.5 px-6 py-3 rounded-2xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 transition-all text-sm font-semibold backdrop-blur-sm"
                        >
                          {friendLoading ? <Loader2 size={18} className="animate-spin" /> : <UserMinus size={18} />}
                          {t('removeFriend')}
                        </motion.button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Информация */}
            <div className="px-5 space-y-3 pb-8 relative z-10">
              {/* О себе */}
              <div className="bg-black/20 backdrop-blur-xl border border-white/5 rounded-2xl p-4 transition-all hover:bg-black/30 hover:border-white/10 group">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-nexo-500/20 flex items-center justify-center border border-nexo-500/30">
                    <Edit3 size={12} className="text-nexo-400" />
                  </div>
                  <label className="text-xs font-semibold text-nexo-200/50 uppercase tracking-widest">
                    {t('aboutMe')}
                  </label>
                </div>
                <p className="text-sm text-zinc-200 leading-relaxed pl-1">
                  {profile.bio || (
                    <span className="text-white/30 italic">{t('notSpecified')}</span>
                  )}
                </p>
              </div>

              {/* Статус */}
              <div className="bg-black/20 backdrop-blur-xl border border-white/5 rounded-2xl p-4 transition-all hover:bg-black/30 hover:border-white/10 group">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center border border-purple-500/30">
                      <MessageSquare size={12} className="text-purple-400" />
                    </div>
                    <label className="text-xs font-semibold text-purple-200/50 uppercase tracking-widest">
                      Статус
                    </label>
                  </div>
                  {isSelf && (
                    <button
                      onClick={startEditingStatus}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                      title="Изменить статус"
                    >
                      <Edit3 size={14} />
                    </button>
                  )}
                </div>
                {status ? (
                  <div className="pl-1">
                    <p className="text-sm text-zinc-200 leading-relaxed flex items-center gap-2">
                      {status.emoji && <span className="text-lg">{status.emoji}</span>}
                      <span>{status.text}</span>
                    </p>
                    {status.expiresAt && (
                      <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1">
                        <Clock size={10} />
                        Истекает {new Date(status.expiresAt).toLocaleString('ru-RU', { 
                          day: 'numeric', 
                          month: 'short', 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-white/30 italic pl-1">
                    {isSelf ? 'Установите статус' : 'Нет статуса'}
                  </p>
                )}
              </div>

              {/* Музыка в профиле */}
              {(profile as any).profileMusic && (
                <div className="bg-gradient-to-r from-pink-500/10 to-purple-500/10 backdrop-blur-xl border border-pink-500/20 rounded-2xl p-4 transition-all hover:from-pink-500/20 hover:to-purple-500/20 hover:border-pink-500/30 group">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        if (audioRef.current) {
                          if (isPlayingMusic) {
                            audioRef.current.pause();
                            setIsPlayingMusic(false);
                          } else {
                            audioRef.current.play();
                            setIsPlayingMusic(true);
                          }
                        }
                      }}
                      className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center hover:scale-105 transition-transform shadow-lg shadow-pink-500/30"
                    >
                      {isPlayingMusic ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                          <rect x="6" y="4" width="4" height="16" rx="1"/>
                          <rect x="14" y="4" width="4" height="16" rx="1"/>
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-pink-300 flex items-center gap-1.5">
                        🎵 Музыка профиля
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {isPlayingMusic ? 'Воспроизводится...' : 'Нажмите для воспроизведения'}
                      </p>
                    </div>
                  </div>
                  <audio
                    ref={audioRef}
                    src={(profile as any).profileMusic}
                    onEnded={() => setIsPlayingMusic(false)}
                    onPause={() => setIsPlayingMusic(false)}
                    onPlay={() => setIsPlayingMusic(true)}
                  />
                </div>
              )}

              {/* Верификация */}
              {profile.isVerified && (
                <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 backdrop-blur-xl border border-blue-500/20 rounded-2xl p-4 transition-all hover:from-blue-500/20 hover:to-purple-500/20 hover:border-blue-500/30 group">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-shrink-0">
                      {profile.verifiedBadgeUrl && profile.verifiedBadgeType !== 'default' ? (
                        <img
                          src={profile.verifiedBadgeUrl}
                          alt="verified"
                          className="w-12 h-12 rounded-full object-cover ring-2 ring-blue-500/40 shadow-lg shadow-blue-500/20"
                        />
                      ) : (
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center ring-2 ring-blue-500/30 shadow-lg"
                          style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)', boxShadow: '0 0 20px rgba(99,102,241,0.4)' }}
                        >
                          <Check size={24} className="text-white" strokeWidth={3} />
                        </div>
                      )}
                      {/* Glow pulse */}
                      <div className="absolute inset-0 rounded-full animate-ping opacity-20"
                        style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-blue-300 flex items-center gap-1.5">
                        Верифицированный аккаунт
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {profile.verifiedAt
                          ? `Верифицирован ${new Date(profile.verifiedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`
                          : 'Аккаунт верифицирован'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Premium */}
              {profile.isPremium && (
                <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 backdrop-blur-xl border border-yellow-500/20 rounded-2xl p-4 transition-all hover:from-yellow-500/20 hover:to-orange-500/20 hover:border-yellow-500/30 group">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-shrink-0">
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center ring-2 ring-yellow-500/30 shadow-lg"
                        style={{ background: 'linear-gradient(135deg, #fbbf24, #f97316)', boxShadow: '0 0 20px rgba(251, 191, 36, 0.4)' }}
                      >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-white">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                        </svg>
                      </div>
                      {/* Glow pulse */}
                      <div className="absolute inset-0 rounded-full animate-ping opacity-20"
                        style={{ background: 'radial-gradient(circle, #fbbf24, transparent)' }} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-yellow-300 flex items-center gap-1.5">
                        Нексо НУче
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {profile.premiumUntil
                          ? `Активна до ${new Date(profile.premiumUntil).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`
                          : 'Активная подписка'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Дата рождения */}
              {profile.birthday && (
                <div className="bg-black/20 backdrop-blur-xl border border-white/5 rounded-2xl p-4 transition-all hover:bg-black/30 hover:border-white/10 group">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center border border-orange-500/30">
                      <Calendar size={12} className="text-orange-400" />
                    </div>
                    <label className="text-xs font-semibold text-orange-200/50 uppercase tracking-widest">
                      {t('birthday')}
                    </label>
                  </div>
                  <p className="text-sm text-zinc-200 pl-1">
                    {profile.birthday ? (
                      new Date(profile.birthday).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })
                    ) : (
                      <span className="text-white/30 italic">{t('notSpecified')}</span>
                    )}
                  </p>
                </div>
              )}

              {/* Дата регистрации */}
              <div className="bg-black/20 backdrop-blur-xl border border-white/5 rounded-2xl p-4 transition-all hover:bg-black/30 hover:border-white/10 group">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                    <Check size={12} className="text-emerald-400" />
                  </div>
                  <label className="text-xs font-semibold text-emerald-200/50 uppercase tracking-widest">
                    {t('onNexoSince')}
                  </label>
                </div>
                <p className="text-sm text-zinc-200 pl-1">
                  {new Date(profile.createdAt).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              </div>

              {/* Статистика стены */}
              <div className="bg-gradient-to-r from-nexo-500/10 to-purple-500/10 backdrop-blur-xl border border-nexo-500/20 rounded-2xl p-4 transition-all hover:from-nexo-500/20 hover:to-purple-500/20 hover:border-nexo-500/30">
                <div className="flex items-center gap-2 mb-3">
                  <Newspaper size={16} className="text-nexo-400" />
                  <p className="text-xs font-semibold text-nexo-400 uppercase tracking-wider">
                    Стена
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => {
                      // Открыть список подписчиков
                      window.location.href = `/?user=${profile.username}`;
                    }}
                    className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <span className="text-lg font-bold text-white">{(profile as any).subscribersCount || 0}</span>
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Подписчики</span>
                  </button>
                  <button
                    onClick={() => {
                      // Открыть список постов
                      window.location.href = `/?user=${profile.username}`;
                    }}
                    className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <span className="text-lg font-bold text-white">{(profile as any).postsCount || 0}</span>
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Посты</span>
                  </button>
                  <button
                    onClick={() => {
                      if (isSelf) {
                        setActiveTab('hashtags');
                      }
                    }}
                    className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <span className="text-lg font-bold text-white">{userHashtags.length}</span>
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Хэштеги</span>
                  </button>
                </div>
              </div>

              {/* Закреплённый канал */}
              {profile.pinnedChannel && (
                <div className="bg-black/20 backdrop-blur-xl border border-white/5 rounded-2xl p-4 transition-all hover:bg-black/30 hover:border-white/10 group">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full bg-nexo-500/20 flex items-center justify-center border border-nexo-500/30">
                      <Pin size={12} className="text-nexo-400" />
                    </div>
                    <label className="text-xs font-semibold text-nexo-200/50 uppercase tracking-widest">
                      Канал
                    </label>
                  </div>
                  <a
                    href={`/?channel=${encodeURIComponent(profile.pinnedChannel.username || '')}`}
                    className="flex items-center gap-3 p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all group/channel"
                  >
                    {profile.pinnedChannel.avatar ? (
                      <img
                        src={profile.pinnedChannel.avatar}
                        alt=""
                        className="w-12 h-12 rounded-full object-cover ring-2 ring-nexo-500/30"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-nexo-500 to-purple-600 flex items-center justify-center text-white font-bold ring-2 ring-nexo-500/30">
                        <Hash size={20} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate group-hover/channel:text-nexo-300 transition-colors">
                        {profile.pinnedChannel.name || profile.pinnedChannel.username}
                      </p>
                      <p className="text-xs text-zinc-500 truncate">
                        {profile.pinnedChannel.description || `@${profile.pinnedChannel.username}`}
                      </p>
                      <p className="text-xs text-nexo-400 mt-0.5">
                        👥 {profile.pinnedChannel.members.length} подписчиков
                      </p>
                    </div>
                    <ExternalLink size={16} className="text-zinc-500 group-hover/channel:text-nexo-400 transition-colors flex-shrink-0" />
                  </a>
                </div>
              )}

              {/* Кнопка прикрепления канала (только для своего профиля) */}
              {isSelf && (
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowPinModal(true)}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-white/10 hover:border-nexo-500/50 hover:bg-nexo-500/10 transition-all group/btn backdrop-blur-sm bg-white/[0.02]"
                >
                  <Pin size={16} className="text-zinc-500 group-hover/btn:text-nexo-400 transition-colors" />
                  <span className="text-sm text-zinc-400 group-hover/btn:text-nexo-300 transition-colors">
                    {profile.pinnedChannel ? 'Изменить закреплённый канал' : 'Прикрепить канал'}
                  </span>
                </motion.button>
              )}

              {/* Кнопка NFT инвентаря (только для своего профиля) */}
              {isSelf && (
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowNFTInventory(true)}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-purple-500/20 hover:border-purple-500/50 hover:bg-purple-500/10 transition-all group/btn backdrop-blur-sm bg-white/[0.02]"
                >
                  <span className="text-base">✨</span>
                  <span className="text-sm text-zinc-400 group-hover/btn:text-purple-300 transition-colors">
                    {equippedNFTCard ? `Надета: ${equippedNFTCard.name}` : 'Мои NFT'}
                  </span>
                </motion.button>
              )}
            </div>

            {/* Медиа / Файлы / Ссылки */}
            <div className="border-t border-white/5 bg-black/10 mt-2 backdrop-blur-md">
              <div className="flex px-2 pt-2 gap-1 overflow-x-auto no-scrollbar">
                {tabs.map((tab) => (
                  <motion.button
                    key={tab.key}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 px-1 text-xs font-bold transition-all rounded-t-xl min-w-[100px] ${activeTab === tab.key
                      ? 'bg-white/10 text-white shadow-[inset_0_2px_10px_rgba(255,255,255,0.05)] border-t border-x border-white/10'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                      }`}
                  >
                    <tab.icon size={14} className={activeTab === tab.key ? 'text-nexo-400' : 'opacity-70'} />
                    {tab.label}
                  </motion.button>
                ))}
              </div>
              <div className="min-h-[160px] bg-white/[0.02] border-t border-white/5 relative">
                {/* Subtle top glow for active tab content */}
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-nexo-500/50 to-transparent" />
                {tabLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={20} className="animate-spin text-zinc-500" />
                  </div>
                ) : activeTab === 'media' ? (
                  sharedMedia.length > 0 ? (
                    <div className="grid grid-cols-3 gap-0.5 p-1">
                      {(() => {
                        const allMedia = sharedMedia.flatMap((msg) => (msg.media || []));
                        return allMedia.map((m, idx) => (
                          <div
                            key={m.id}
                            onClick={() => setLightboxIndex(idx)}
                            className="relative aspect-square bg-zinc-900 overflow-hidden group cursor-pointer"
                          >
                            {m.type === 'video' ? (
                              <>
                                <img
                                  src={m.thumbnail || m.url}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                  <Play size={24} className="text-white fill-white" />
                                </div>
                              </>
                            ) : (
                              <img
                                src={m.url}
                                alt=""
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              />
                            )}
                          </div>
                        ));
                      })()}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-8">
                      <p className="text-xs text-zinc-600 italic">{t('sharedPhotos')}</p>
                    </div>
                  )
                ) : activeTab === 'files' ? (
                  sharedFiles.length > 0 ? (
                    <div className="divide-y divide-border">
                      {sharedFiles.flatMap((msg) =>
                        (msg.media || []).map((m) => (
                          <a
                            key={m.id}
                            href={m.url}
                            download={m.filename || 'file'}
                            className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors group/file"
                          >
                            <div className="w-10 h-10 rounded-xl bg-nexo-500/20 flex items-center justify-center flex-shrink-0 border border-nexo-500/30 group-hover/file:scale-105 transition-transform">
                              <FileText size={18} className="text-nexo-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white truncate">{m.filename || 'file'}</p>
                              <p className="text-xs text-zinc-500">
                                {m.size ? `${(m.size / 1024).toFixed(1)} KB` : ''}
                                {msg.sender ? ` · ${msg.sender.displayName || msg.sender.username}` : ''}
                              </p>
                            </div>
                            <Download size={16} className="text-zinc-500 flex-shrink-0" />
                          </a>
                        ))
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-8">
                      <p className="text-xs text-zinc-600 italic">{t('sharedFiles')}</p>
                    </div>
                  )
                ) : (
                  sharedLinks.length > 0 ? (
                    <div className="divide-y divide-border">
                      {sharedLinks.map((msg) => (
                        <div key={msg.id} className="px-4 py-3 hover:bg-white/5 transition-colors">
                          <p className="text-xs text-zinc-500 mb-1.5 font-medium">
                            {msg.sender?.displayName || msg.sender?.username} · {new Date(msg.createdAt).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US')}
                          </p>
                          {(msg.links || []).map((link: string, i: number) => (
                            <a
                              key={i}
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-nexo-400 hover:text-nexo-300 transition-colors truncate"
                            >
                              <ExternalLink size={14} className="flex-shrink-0" />
                              <span className="truncate">{link}</span>
                            </a>
                          ))}
                          {msg.content && (
                            <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{msg.content}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-8">
                      <p className="text-xs text-zinc-600 italic">{t('sharedLinks')}</p>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Calls tab content */}
            {activeTab === 'calls' && (
              <div className="min-h-[160px] bg-white/[0.02] border-t border-white/5 relative">
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-nexo-500/50 to-transparent" />
                {callHistory.length > 0 ? (
                  <div className="divide-y divide-white/5">
                    {callHistory.map((call) => (
                      <div
                        key={call.id}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors"
                      >
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                          call.status === 'missed' ? 'bg-red-500/20 text-red-400' :
                          call.status === 'declined' ? 'bg-orange-500/20 text-orange-400' :
                          'bg-emerald-500/20 text-emerald-400'
                        }`}>
                          {call.status === 'missed' ? <PhoneMissed size={16} /> :
                           call.isIncoming ? <PhoneIncoming size={16} /> :
                           <PhoneOutgoing size={16} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white font-medium">
                            {call.status === 'missed' ? (call.isIncoming ? t('missedCall') : t('declinedCall')) :
                             call.isIncoming ? t('incomingCall') : t('outgoingCall')}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {new Date(call.createdAt).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-zinc-400 font-mono">
                            {call.duration > 0 ? formatCallDuration(call.duration) : '-'}
                          </p>
                          <p className={`text-xs ${
                            call.type === 'video' ? 'text-purple-400' : 'text-zinc-500'
                          }`}>
                            {call.type === 'video' ? t('videoCall') : t('audioCall')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-8">
                    <p className="text-xs text-zinc-600 italic">{t('noCalls')}</p>
                  </div>
                )}
              </div>
            )}

            {/* Music tab */}
            {activeTab === 'music' && (
              <div className="min-h-[160px] bg-white/[0.02] border-t border-white/5 relative p-4">
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-nexo-500/50 to-transparent" />
                <ProfileMusic userId={userId} isOwner={isSelf || false} />
                
                {/* Premium Badge Upload (only for self and premium users) */}
                {isSelf && isPremium && (
                  <div className="mt-6">
                    <PremiumBadgeUpload />
                  </div>
                )}
              </div>
            )}

            {/* NFT Подарки */}
            {activeTab === 'nft_gifts' && (
              <div className="min-h-[160px] bg-white/[0.02] border-t border-white/5 relative p-4">
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent" />
                {profileNFTCards.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mb-4 border border-purple-500/30">
                      <Crown size={32} className="text-purple-400" />
                    </div>
                    <p className="text-sm text-zinc-400 font-medium">Нет NFT карточек</p>
                    <p className="text-xs text-zinc-600 mt-1">Купите карточки в маркетплейсе</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {profileNFTCards.map((instance: any) => (
                      <div key={instance.id} className="group relative">
                        {/* Card container */}
                        <div className="relative aspect-[3/4] rounded-2xl overflow-hidden border-2 border-white/10 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] hover:border-purple-500/50">
                          {/* Background */}
                          <div className="absolute inset-0" style={{
                            background: instance.card.gradientColors
                              ? `linear-gradient(135deg, ${JSON.parse(instance.card.gradientColors).join(', ')})`
                              : instance.card.backgroundColor || '#667eea',
                          }} />
                          
                          {/* Photo */}
                          {instance.card.photoUrl && (
                            <div className="absolute inset-0 flex items-center justify-center p-4">
                              <img 
                                src={instance.card.photoUrl} 
                                className="max-w-full max-h-full object-contain drop-shadow-2xl" 
                                alt={instance.card.name}
                                style={{
                                  filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.4))',
                                }}
                              />
                            </div>
                          )}
                          
                          {/* Equipped badge */}
                          {instance.isEquipped && (
                            <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full font-bold shadow-lg flex items-center gap-1">
                              <Check size={12} />
                              Надета
                            </div>
                          )}
                          
                          {/* Info overlay */}
                          <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/95 via-black/70 to-transparent">
                            <div className="text-sm font-bold text-white truncate drop-shadow-lg">{instance.card.name}</div>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-xs text-white/60 font-medium">#{instance.serialNumber}/{instance.card.totalSupply}</span>
                              <span className={`text-xs font-bold uppercase tracking-wider ${
                                instance.card.rarity === 'Legendary' ? 'text-yellow-400' :
                                instance.card.rarity === 'Epic' ? 'text-purple-400' :
                                instance.card.rarity === 'Rare' ? 'text-blue-400' :
                                'text-gray-300'
                              }`}>
                                {instance.card.rarity}
                              </span>
                            </div>
                          </div>
                          
                          {/* Holographic shine */}
                          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/5 pointer-events-none mix-blend-overlay" />
                        </div>
                        
                        {/* Gift history */}
                        {instance.giftHistory?.[0] && (
                          <div className="mt-2 px-2 py-1.5 rounded-lg bg-white/5 border border-white/5">
                            <div className="text-xs text-white/50 flex items-center gap-1">
                              <span className="text-pink-400">🎁</span>
                              <span className="text-white/70 font-medium">От:</span>
                              <span className="text-white/90 truncate">@{instance.giftHistory[0].fromUser?.username || 'Unknown'}</span>
                            </div>
                            {instance.giftHistory[0].message && (
                              <div className="text-xs text-white/60 italic mt-1 line-clamp-2">"{instance.giftHistory[0].message}"</div>
                            )}
                          </div>
                        )}
                        
                        {/* Price */}
                        <div className="mt-2 flex items-center justify-center gap-1.5 text-sm font-bold text-purple-400">
                          <span>{instance.card.currentPrice}</span>
                          <BeaverIcon size={16} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* NFT Теги */}
            {activeTab === 'nft_tags' && (
              <div className="min-h-[160px] bg-white/[0.02] border-t border-white/5 relative p-4">
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent" />
                {profileNFTTags.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center mb-4 border border-blue-500/30">
                      <Hash size={32} className="text-blue-400" />
                    </div>
                    <p className="text-sm text-zinc-400 font-medium">Нет тегов</p>
                    <p className="text-xs text-zinc-600 mt-1">Купите теги в маркетплейсе</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {profileNFTTags.map((instance: any) => (
                      <div key={instance.id} className="group relative">
                        {/* Tag container */}
                        <div className="bg-white/5 rounded-2xl p-4 text-center border border-white/10 hover:border-purple-500/50 transition-all duration-300 hover:scale-105 hover:shadow-xl">
                          {/* Icon */}
                          <div 
                            className="w-16 h-16 mx-auto mb-3 rounded-full flex items-center justify-center text-2xl border-2 border-white/20 shadow-lg transition-transform group-hover:scale-110"
                            style={{
                              background: instance.tag.backgroundColor || '#667eea',
                              boxShadow: instance.tag.glowColor ? `0 0 20px ${instance.tag.glowColor}` : '0 4px 12px rgba(0,0,0,0.3)',
                            }}>
                            {instance.tag.iconUrl}
                          </div>
                          
                          {/* Name */}
                          <div className="text-sm font-bold text-white truncate mb-1">{instance.tag.name}</div>
                          
                          {/* Serial */}
                          <div className="text-xs text-white/50 font-medium">#{instance.serialNumber}</div>
                          
                          {/* Equipped badge */}
                          {instance.isEquipped && (
                            <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/20 border border-green-500/40">
                              <Check size={10} className="text-green-400" />
                              <span className="text-xs text-green-400 font-bold">Слот {instance.slot}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Hashtags tab */}
            {activeTab === 'hashtags' && (
              <div className="min-h-[160px] bg-white/[0.02] border-t border-white/5 relative p-4">
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-nexo-500/50 to-transparent" />
                {userHashtags.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-nexo-500/20 to-purple-500/20 flex items-center justify-center mb-4 border border-nexo-500/30">
                      <Hash size={32} className="text-nexo-400" />
                    </div>
                    <p className="text-sm text-zinc-400 font-medium">Нет хэштегов</p>
                    <p className="text-xs text-zinc-600 mt-1">Создайте пост с #хэштегом</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {userHashtags.map((hashtag) => (
                      <div 
                        key={hashtag.id}
                        className="bg-white/5 rounded-xl p-4 border border-white/10 hover:border-nexo-500/50 transition-all duration-300 hover:bg-white/10 group cursor-pointer"
                        onClick={() => {
                          window.location.href = `/wall/hashtag/${hashtag.tag}`;
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-12 h-12 rounded-full bg-nexo-500/20 flex items-center justify-center border border-nexo-500/30 group-hover:scale-110 transition-transform">
                              <Hash size={20} className="text-nexo-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-base font-bold text-white truncate group-hover:text-nexo-300 transition-colors">
                                #{hashtag.tag}
                              </p>
                              <p className="text-xs text-zinc-500">
                                Создан {new Date(hashtag.createdAt).toLocaleDateString('ru-RU', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric'
                                })}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs text-zinc-500">Всего:</span>
                              <span className="text-lg font-bold text-nexo-400">{hashtag.useCount}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-zinc-500">Вами:</span>
                              <span className="text-sm font-bold text-white">{hashtag.ownerUseCount}</span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Progress bar */}
                        <div className="mt-3 h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-nexo-500 to-purple-500 rounded-full transition-all duration-500"
                            style={{ width: `${(hashtag.ownerUseCount / hashtag.useCount) * 100}%` }}
                          />
                        </div>
                        <p className="text-xs text-zinc-600 mt-1.5 text-center">
                          {((hashtag.ownerUseCount / hashtag.useCount) * 100).toFixed(0)}% ваших постов
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-500">
            {t('profileNotFound')}
          </div>
        )}
      </motion.div>

      {/* Media lightbox gallery */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <ImageLightbox
            images={sharedMedia.flatMap((msg) => (msg.media || []).map((m) => ({ url: m.url, type: m.type })))}
            initialIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        )}
      </AnimatePresence>

      {/* Edit profile modal */}
      <AnimatePresence>
        {isEditingProfile && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50"
              onClick={() => setIsEditingProfile(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-surface-secondary border border-white/10 rounded-2xl z-50 shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between p-4 border-b border-white/5">
                <h3 className="text-lg font-bold text-white">Редактировать профиль</h3>
                <button
                  onClick={() => setIsEditingProfile(false)}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors text-zinc-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                {/* Avatar upload */}
                <div className="flex flex-col items-center gap-3 pb-2">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full overflow-hidden ring-2 ring-white/10">
                      {profile?.avatar ? (
                        <img src={profile.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-nexo-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-white">
                          {(profile?.displayName || profile?.username || '?')[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                    <label className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-nexo-500 hover:bg-nexo-400 flex items-center justify-center cursor-pointer transition-colors shadow-lg">
                      {avatarUploading ? (
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Camera size={14} className="text-white" />
                      )}
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarUploadInEdit}
                        disabled={avatarUploading}
                      />
                    </label>
                  </div>
                  <p className="text-xs text-zinc-500">Нажмите на камеру чтобы сменить фото</p>
                </div>

                {/* Username */}
                <div>
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 block">
                    Username
                  </label>
                  <div className="relative">
                    <AtSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                      type="text"
                      value={editData.username}
                      onChange={(e) => setEditData({ ...editData, username: e.target.value })}
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-surface-tertiary border border-border text-white focus:border-nexo-500 focus:outline-none"
                      placeholder="@username"
                    />
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">3-20 символов, только латиница, цифры и _</p>
                </div>

                {/* Display name */}
                <div>
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 block">
                    Отображаемое имя
                  </label>
                  <input
                    type="text"
                    value={editData.displayName}
                    onChange={(e) => setEditData({ ...editData, displayName: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-surface-tertiary border border-border text-white focus:border-nexo-500 focus:outline-none"
                    placeholder="Ваше имя"
                  />
                </div>

                {/* Bio */}
                <div>
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 block">
                    О себе
                  </label>
                  <textarea
                    value={editData.bio}
                    onChange={(e) => setEditData({ ...editData, bio: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-surface-tertiary border border-border text-white focus:border-nexo-500 focus:outline-none resize-none h-24"
                    placeholder="Расскажите о себе..."
                  />
                </div>

                {/* Birthday */}
                <div>
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 block">
                    Дата рождения
                  </label>
                  <DatePicker
                    value={editData.birthday}
                    onChange={(val) => setEditData({ ...editData, birthday: val })}
                  />
                </div>
              </div>

              <div className="flex gap-3 p-4 border-t border-white/5 bg-white/5">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSaveProfile}
                  disabled={isSavingProfile}
                  className="flex-1 py-3 rounded-xl bg-nexo-500/90 hover:bg-nexo-500 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 backdrop-blur-sm border border-white/10"
                >
                  {isSavingProfile ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                  Сохранить
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setIsEditingProfile(false)}
                  disabled={isSavingProfile}
                  className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-medium transition-all disabled:opacity-50 backdrop-blur-sm border border-white/10"
                >
                  Отмена
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Status Edit Modal */}
      <AnimatePresence>
        {isEditingStatus && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsEditingStatus(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="relative w-full max-w-md rounded-2xl bg-surface-secondary border border-white/10 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare size={20} className="text-purple-400" />
                  <h3 className="text-lg font-semibold text-white">Изменить статус</h3>
                </div>
                <button
                  onClick={() => setIsEditingStatus(false)}
                  className="p-2 rounded-lg hover:bg-white/5 transition-colors text-zinc-400 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-4 space-y-4">
                <div>
                  <label className="text-xs text-zinc-500 mb-1.5 block">Эмодзи (необязательно)</label>
                  <input
                    type="text"
                    value={statusEmoji}
                    onChange={(e) => setStatusEmoji(e.target.value.slice(0, 2))}
                    placeholder="😊"
                    maxLength={2}
                    className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-2xl text-center placeholder-zinc-500 focus:outline-none focus:border-purple-500/50 transition-colors"
                  />
                </div>

                <div>
                  <label className="text-xs text-zinc-500 mb-1.5 block">Текст статуса</label>
                  <input
                    type="text"
                    value={statusText}
                    onChange={(e) => setStatusText(e.target.value.slice(0, 200))}
                    placeholder="Чем вы занимаетесь?"
                    maxLength={200}
                    className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500/50 transition-colors"
                    autoFocus
                  />
                  <p className="text-xs text-zinc-600 mt-1 text-right">{statusText.length}/200</p>
                </div>

                <div>
                  <label className="text-xs text-zinc-500 mb-1.5 block">Истекает через</label>
                  <select
                    value={statusExpires}
                    onChange={(e) => setStatusExpires(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#1a1a2e] border border-white/10 text-white focus:outline-none focus:border-purple-500/50 transition-colors appearance-none"
                  >
                    <option value="1" className="bg-[#1a1a2e] text-white">1 час</option>
                    <option value="4" className="bg-[#1a1a2e] text-white">4 часа</option>
                    <option value="8" className="bg-[#1a1a2e] text-white">8 часов</option>
                    <option value="24" className="bg-[#1a1a2e] text-white">24 часа</option>
                    <option value="168" className="bg-[#1a1a2e] text-white">7 дней</option>
                    <option value="" className="bg-[#1a1a2e] text-white">Никогда</option>
                  </select>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleSaveStatus}
                    disabled={!statusText.trim()}
                    className="flex-1 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium transition-colors"
                  >
                    Сохранить
                  </button>
                  {status && (
                    <button
                      onClick={handleDeleteStatus}
                      className="px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-medium transition-colors"
                    >
                      Удалить
                    </button>
                  )}
                  <button
                    onClick={() => setIsEditingStatus(false)}
                    className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white font-medium transition-colors"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pin channel modal */}
      <AnimatePresence>
        {showPinModal && (
          <PinChannelModal
            userId={userId}
            currentPinnedChannelId={profile?.pinnedChannelId}
            onPin={() => {
              loadProfile();
            }}
            onUnpin={() => {
              loadProfile();
            }}
            onClose={() => setShowPinModal(false)}
          />
        )}
      </AnimatePresence>

      {/* Secret chat modal */}
      {showSecretChatModal && profile && (
        <SecretChatModal
          isOpen={showSecretChatModal}
          onClose={() => setShowSecretChatModal(false)}
          userId={userId}
          username={profile.displayName || profile.username}
          onChatCreated={(chatId) => {
            setShowSecretChatModal(false);
            // Reload chats to include the new secret chat
            const { loadChats, setActiveChat } = useChatStore.getState();
            loadChats();
            setActiveChat(chatId);
            onClose();
          }}
        />
      )}

      {/* NFT Inventory Modal */}
      <AnimatePresence>
        {showNFTInventory && (
          <NFTInventoryModal
            onClose={() => {
              setShowNFTInventory(false);
              // Перезагрузить надетую карточку после закрытия
              api.get<{ card: any; tags: any[] }>(`/nft/equipped/${userId}`).then((data) => {
                setEquippedNFTCard(data?.card?.card || null);
                setEquippedNFTTags(data?.tags || []);
              }).catch(() => {});
            }}
          />
        )}
      </AnimatePresence>

      {showQRCode && profile && (
        <QRCodeModal
          user={{
            id: profile.id,
            username: profile.username || '',
            displayName: profile.displayName || profile.username || '',
            avatar: profile.avatar || null,
          }}
          onClose={() => setShowQRCode(false)}
        />
      )}
    </>
  );
}
