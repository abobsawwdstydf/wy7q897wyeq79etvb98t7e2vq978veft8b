import { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, User, Newspaper, Plus, Users } from 'lucide-react';
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
  id: MobileView;
  label: string;
  icon: typeof MessageSquare;
  badge?: number;
}

export default function MobileBottomNav({
  currentView,
  onNavigate,
  onOpenAI,
  onOpenCreate,
  onOpenProfile,
}: MobileBottomNavProps) {
  const { chats } = useChatStore();
  const { user } = useAuthStore();
  const [pressedId, setPressedId] = useState<MobileView | null>(null);

  const unreadCount = chats.reduce((acc, chat) => acc + (chat.unreadCount || 0), 0);

  const items: NavItem[] = [
    { id: 'chat', label: 'Чаты', icon: MessageSquare, badge: unreadCount },
    { id: 'friends', label: 'Друзья', icon: Users },
    { id: 'wall', label: 'Стена', icon: Newspaper },
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

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60] sm:hidden pb-[env(safe-area-inset-bottom)]">
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        className="mx-3 mb-3"
      >
        <div className="relative bg-[#14141a]/85 backdrop-blur-2xl rounded-3xl border border-white/[0.07] shadow-[0_8px_32px_rgba(0,0,0,0.45)] overflow-hidden">
          {/* Глянцевый блик сверху */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

          <div className="relative flex items-stretch justify-between px-2 py-1.5">
            {/* Левая группа: Чаты, Друзья */}
            <div className="flex items-center gap-0.5 flex-1 justify-around">
              {items.slice(0, 2).map((item) => {
                const Icon = item.icon;
                const active = isActive(item.id);
                return (
                  <NavButton
                    key={item.id}
                    item={item}
                    Icon={Icon}
                    active={active}
                    pressed={pressedId === item.id}
                    onClick={() => {
                      setPressedId(item.id);
                      handleNav(item.id);
                      setTimeout(() => setPressedId(null), 200);
                    }}
                  />
                );
              })}
            </div>

            {/* Центральная кнопка */}
            <div className="flex items-center justify-center px-1">
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={() => {
                  if ('vibrate' in navigator) navigator.vibrate(15);
                  onOpenCreate?.();
                }}
                className="relative w-12 h-12 -my-3 rounded-2xl bg-gradient-to-br from-[#6366f1] via-[#7c3aed] to-[#a855f7] flex items-center justify-center text-white shadow-[0_6px_18px_rgba(99,102,241,0.5),inset_0_1px_0_rgba(255,255,255,0.25)] active:shadow-[0_3px_10px_rgba(99,102,241,0.4)]"
                aria-label="Создать"
              >
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 to-transparent opacity-50" />
                <Plus size={22} strokeWidth={2.5} className="relative" />
              </motion.button>
            </div>

            {/* Правая группа: Стена, Профиль */}
            <div className="flex items-center gap-0.5 flex-1 justify-around">
              {items.slice(2, 4).map((item) => {
                const Icon = item.icon;
                const active = isActive(item.id);
                const isProfile = item.id === 'profile';

                if (isProfile) {
                  return (
                    <ProfileButton
                      key={item.id}
                      active={active}
                      pressed={pressedId === item.id}
                      avatarUrl={user?.avatar ? normalizeMediaUrl(user.avatar) : null}
                      displayName={user?.displayName || user?.username}
                      onClick={() => {
                        setPressedId(item.id);
                        handleNav(item.id);
                        setTimeout(() => setPressedId(null), 200);
                      }}
                    />
                  );
                }

                return (
                  <NavButton
                    key={item.id}
                    item={item}
                    Icon={Icon}
                    active={active}
                    pressed={pressedId === item.id}
                    onClick={() => {
                      setPressedId(item.id);
                      handleNav(item.id);
                      setTimeout(() => setPressedId(null), 200);
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function NavButton({
  item,
  Icon,
  active,
  pressed,
  onClick,
}: {
  item: NavItem;
  Icon: typeof MessageSquare;
  active: boolean;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className="relative flex flex-col items-center justify-center gap-0.5 min-w-[52px] py-1.5 px-2 rounded-2xl"
    >
      {/* Активный индикатор (капсула позади иконки) */}
      {active && (
        <motion.div
          layoutId="mobile-nav-active"
          className="absolute inset-1 rounded-2xl bg-gradient-to-br from-[#6366f1]/20 to-[#8b5cf6]/15 border border-[#6366f1]/25"
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        />
      )}

      <div className="relative">
        <Icon
          size={21}
          strokeWidth={active ? 2.5 : 2}
          className={`relative transition-colors duration-200 ${
            active ? 'text-[#818cf8]' : pressed ? 'text-white/60' : 'text-white/45'
          }`}
        />

        {/* Бейдж непрочитанных */}
        {item.badge !== undefined && item.badge > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-gradient-to-br from-[#ef4444] to-[#dc2626] flex items-center justify-center shadow-[0_0_0_2px_#14141a]"
          >
            <span className="text-[9px] font-bold text-white leading-none">
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          </motion.div>
        )}
      </div>

      <span
        className={`relative text-[10px] font-semibold transition-colors duration-200 ${
          active ? 'text-[#818cf8]' : 'text-white/45'
        }`}
      >
        {item.label}
      </span>
    </motion.button>
  );
}

function ProfileButton({
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
      className="relative flex flex-col items-center justify-center gap-0.5 min-w-[52px] py-1.5 px-2 rounded-2xl"
    >
      {active && (
        <motion.div
          layoutId="mobile-nav-active-profile"
          className="absolute inset-1 rounded-2xl bg-gradient-to-br from-[#6366f1]/20 to-[#8b5cf6]/15 border border-[#6366f1]/25"
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        />
      )}

      <div className="relative">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className={`w-[22px] h-[22px] rounded-full object-cover transition-all duration-200 ${
              active
                ? 'ring-[1.5px] ring-[#818cf8] ring-offset-[1.5px] ring-offset-[#14141a]'
                : pressed
                  ? 'opacity-70'
                  : ''
            }`}
          />
        ) : (
          <div
            className={`w-[22px] h-[22px] rounded-full flex items-center justify-center bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] text-white text-[10px] font-bold transition-all duration-200 ${
              active ? 'ring-[1.5px] ring-[#818cf8] ring-offset-[1.5px] ring-offset-[#14141a]' : ''
            }`}
          >
            {(displayName || '?')[0].toUpperCase()}
          </div>
        )}
      </div>

      <span
        className={`relative text-[10px] font-semibold transition-colors duration-200 ${
          active ? 'text-[#818cf8]' : 'text-white/45'
        }`}
      >
        Профиль
      </span>
    </motion.button>
  );
}
