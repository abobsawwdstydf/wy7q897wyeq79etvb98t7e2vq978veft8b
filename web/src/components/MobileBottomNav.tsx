import { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, User, Newspaper, Plus, Users, Sparkles } from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { normalizeMediaUrl } from '../lib/mediaUrl';

export type MobileView = 'chat' | 'wall' | 'friends' | 'profile' | 'hashtag';

interface MobileBottomNavProps {
  currentView: MobileView;
  onNavigate: (view: MobileView) => void;
  onOpenAI?: () => void;
  onOpenCreate?: () => void;
  onOpenProfile?: () => void;
}

interface NavItem {
  id: MobileView | 'ai';
  label: string;
  icon: typeof MessageSquare;
  badge?: number;
  onClick?: () => void;
}

function MobileBottomNav({
  currentView,
  onNavigate,
  onOpenAI,
  onOpenCreate,
  onOpenProfile,
}: MobileBottomNavProps) {
  const { chats } = useChatStore();
  const { user } = useAuthStore();
  const [pressedId, setPressedId] = useState<MobileView | 'ai' | null>(null);

  const unreadCount = chats.reduce((acc, chat) => acc + (chat.unreadCount || 0), 0);

  const items: NavItem[] = [
    { id: 'chat', label: 'Чаты', icon: MessageSquare, badge: unreadCount },
    { id: 'friends', label: 'Друзья', icon: Users },
    { id: 'wall', label: 'Стена', icon: Newspaper },
    { id: 'ai', label: 'Нексо AI', icon: Sparkles, onClick: onOpenAI },
    { id: 'profile', label: 'Профиль', icon: User },
  ];

  const isActive = (id: MobileView) => currentView === id;

  const handleNav = (id: MobileView) => {
    if ('vibrate' in navigator) navigator.vibrate(10);
    if (id === 'profile') {
      onOpenProfile?.();
      return;
    }
    onNavigate(id);
  };

  const handlePress = (id: MobileView | 'ai') => {
    setPressedId(id);
    setTimeout(() => setPressedId(null), 200);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60] sm:hidden pb-[env(safe-area-inset-bottom)]">
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="mx-4 mb-2"
      >
        {/* Liquid glass pill container */}
        <div className="relative rounded-full liquid-glass border border-white/[0.15] shadow-[0_8px_32px_0_rgba(0,0,0,0.8)] overflow-hidden">
          {/* Top highlight edge */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

          <div className="relative flex items-center justify-around px-2 py-2">
            {/* Chats */}
            <NavPillButton
              item={items[0]}
              Icon={items[0].icon}
              active={isActive('chat')}
              pressed={pressedId === 'chat'}
              onClick={() => {
                handlePress('chat');
                handleNav('chat');
              }}
            />

            {/* Friends */}
            <NavPillButton
              item={items[1]}
              Icon={items[1].icon}
              active={isActive('friends')}
              pressed={pressedId === 'friends'}
              onClick={() => {
                handlePress('friends');
                handleNav('friends');
              }}
            />

            {/* Create button - center */}
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={() => {
                if ('vibrate' in navigator) navigator.vibrate(15);
                onOpenCreate?.();
              }}
              className="relative w-11 h-11 -my-2 rounded-full bg-white/20 scale-105 flex items-center justify-center text-white shadow-[0_0_15px_rgba(255,255,255,0.3)] active:shadow-[0_0_8px_rgba(255,255,255,0.2)] transition-all duration-300 border border-white/20"
              aria-label="Создать"
            >
              <Plus size={20} strokeWidth={2.5} className="relative" />
            </motion.button>

            {/* Wall */}
            <NavPillButton
              item={items[2]}
              Icon={items[2].icon}
              active={isActive('wall')}
              pressed={pressedId === 'wall'}
              onClick={() => {
                handlePress('wall');
                handleNav('wall');
              }}
            />

            {/* AI */}
            <NavPillButton
              item={items[3]}
              Icon={items[3].icon}
              active={false}
              pressed={pressedId === 'ai'}
              accent
              onClick={() => {
                handlePress('ai');
                if ('vibrate' in navigator) navigator.vibrate(15);
                onOpenAI?.();
              }}
            />

            {/* Profile */}
            <ProfilePillButton
              active={isActive('profile')}
              pressed={pressedId === 'profile'}
              avatarUrl={user?.avatar ? normalizeMediaUrl(user.avatar) : null}
              displayName={user?.displayName || user?.username}
              onClick={() => {
                handlePress('profile');
                handleNav('profile');
              }}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default memo(MobileBottomNav);

function NavPillButton({
  item,
  Icon,
  active,
  pressed,
  onClick,
  accent,
}: {
  item: NavItem;
  Icon: typeof MessageSquare;
  active: boolean;
  pressed: boolean;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center gap-0.5 w-12 h-12 rounded-full transition-all duration-500 ease-out ${
        active
          ? 'bg-white/20 scale-110 shadow-[0_0_15px_rgba(255,255,255,0.3)]'
          : 'opacity-40 hover:bg-white/25 hover:scale-105'
      }`}
    >
      <div className="relative">
        <Icon
          size={19}
          strokeWidth={active || accent ? 2.5 : 2}
          className={`relative transition-colors duration-200 ${
            accent
              ? 'text-[#a78bfa]'
              : active
                ? 'text-white'
                : pressed
                  ? 'text-white/60'
                  : 'text-white/70'
          }`}
        />

        {/* Badge */}
        {item.badge !== undefined && item.badge > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-gradient-to-br from-[#ef4444] to-[#dc2626] flex items-center justify-center shadow-[0_0_0_2px_#0a0a0f]"
          >
            <span className="text-[9px] font-bold text-white leading-none">
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          </motion.div>
        )}
      </div>

      <span
        className={`relative text-[9px] font-semibold transition-colors duration-200 ${
          accent ? 'text-[#a78bfa]' : active ? 'text-white' : 'text-white/60'
        }`}
      >
        {item.label}
      </span>
    </motion.button>
  );
}

function ProfilePillButton({
  active,
  pressed,
  avatarUrl,
  displayName,
  onClick,
}: {
  active: boolean;
  pressed: boolean;
  avatarUrl: string | null;
  displayName?: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center gap-0.5 w-12 h-12 rounded-full transition-all duration-500 ease-out ${
        active
          ? 'bg-white/20 scale-110 shadow-[0_0_15px_rgba(255,255,255,0.3)]'
          : 'opacity-40 hover:bg-white/25 hover:scale-105'
      }`}
    >
      <div className="relative">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className={`w-[20px] h-[20px] rounded-xl object-cover transition-all duration-200 ${
              active
                ? 'ring-[1.5px] ring-white ring-offset-[1.5px] ring-offset-transparent'
                : pressed
                  ? 'opacity-70'
                  : ''
            }`}
          />
        ) : (
          <div
            className={`w-[20px] h-[20px] rounded-xl flex items-center justify-center bg-white/30 text-white text-[10px] font-bold transition-all duration-200`}
          >
            {(displayName || '?')[0].toUpperCase()}
          </div>
        )}
      </div>

      <span
        className={`relative text-[9px] font-semibold transition-colors duration-200 ${
          active ? 'text-white' : 'text-white/60'
        }`}
      >
        Профиль
      </span>
    </motion.button>
  );
}
