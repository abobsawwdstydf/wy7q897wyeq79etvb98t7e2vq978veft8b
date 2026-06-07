import { useEffect, useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from './stores/authStore';
import { useChatStore } from './stores/chatStore';
import { useSettingsStore } from './stores/settingsStore';
import { useToastStore } from './stores/toastStore';
import { api } from './lib/api';
import { getSocket } from './lib/socket';
import AuthPage from './pages/AuthPage';
import ChatPage from './pages/ChatPage';
import WallPage from './pages/WallPage';
import FriendsPage from './pages/FriendsPage';
import HashtagPage from './pages/HashtagPage';
import DeviceAuthPage from './pages/DeviceAuthPage';
import ToastContainer from './components/ToastContainer';
import MusicPlayer from './components/MusicPlayer';
import VoicePlayerBar from './components/VoicePlayerBar';
import Sidebar from './components/Sidebar';
import MobileBottomNav, { MobileView } from './components/MobileBottomNav';
import FriendsBottomSheet from './components/FriendsBottomSheet';
import { НексоLoader } from './components/LoadingStates';
import PaymentSuccessPage from './pages/PaymentSuccessPage';
import YooKassaInfoPage from './pages/YooKassaInfoPage';
import AcceptSharedFolderModal from './components/AcceptSharedFolderModal';
import BeaverIcon from './components/BeaverIcon';
import UserProfile from './components/UserProfile';
import { ErrorBoundary } from './components/ErrorBoundary';
import ConnectionStatus from './components/ConnectionStatus';

type AppView = 'chat' | 'wall' | 'friends' | 'profile' | 'hashtag';

export default function App() {
  const { token, user, checkAuth, isLoading, updateUser } = useAuthStore();
  const { loadSettings, loadChatBackgrounds } = useSettingsStore();
  const { success } = useToastStore();
  const { activeChat } = useChatStore();
  const [sharedFolderToken, setSharedFolderToken] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<AppView>('chat');
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [hashtagTag, setHashtagTag] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);
  const [mobileFriendsOpen, setMobileFriendsOpen] = useState(false);
  const currentViewRef = useRef<AppView>('chat');

  // Keep ref in sync with state
  useEffect(() => {
    currentViewRef.current = currentView;
  }, [currentView]);

  // Определяем мобильное устройство
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Страница успешной оплаты
  if (window.location.pathname === '/payment/success') {
    return <PaymentSuccessPage />;
  }

  // Страница ЮKassa info
  if (window.location.pathname === '/yookassainfo') {
    return <YooKassaInfoPage standalone />;
  }

  // Device auth page
  if (window.location.pathname.startsWith('/device')) {
    return <DeviceAuthPage />;
  }

  // Shared folder link - только один раз при монтировании
  useEffect(() => {
    const folderMatch = window.location.pathname.match(/^\/folder\/([a-f0-9]+)$/);
    if (folderMatch && user) {
      const folderToken = folderMatch[1];
      setSharedFolderToken(folderToken);
    }
  }, [user]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Load settings and backgrounds ONLY after successful auth check
  useEffect(() => {
    if (user && token && !isLoading) {
      Promise.all([
        loadSettings(),
        loadChatBackgrounds()
      ]).catch(console.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, token, isLoading]);

  useEffect(() => {
    // Handle hash routes like #/@username
    const handleHashRoute = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/@')) {
        const username = hash.slice(3);
        window.location.href = `/?user=${username}`;
      } else if (hash.startsWith('#/channel/')) {
        const channelUsername = hash.slice(10);
        window.location.href = `/?channel=${channelUsername}`;
      }
    };

    // Handle custom events for navigation
    const handleOpenWall = () => {
      setCurrentView('wall');
    };

    const handleOpenFriends = () => {
      setCurrentView('friends');
    };

    const handleOpenAI = () => {
      if (currentViewRef.current === 'wall') {
        window.dispatchEvent(new Event('wall-open-ai'));
        return;
      }
      window.dispatchEvent(new Event('open-ai-page'));
    };

    const handleOpenChats = () => {
      setCurrentView('chat');
    };

    const handleOpenProfile = () => {
      setProfileUserId(user?.id || null);
      setCurrentView('profile');
    };

    handleHashRoute();
    window.addEventListener('hashchange', handleHashRoute);
    window.addEventListener('open-wall-page', handleOpenWall);
    window.addEventListener('open-friends-page', handleOpenFriends);
    window.addEventListener('open-ai-page', handleOpenAI);
    window.addEventListener('open-chats-page', handleOpenChats);
    window.addEventListener('open-profile-page', handleOpenProfile);

    return () => {
      window.removeEventListener('hashchange', handleHashRoute);
      window.removeEventListener('open-wall-page', handleOpenWall);
      window.removeEventListener('open-friends-page', handleOpenFriends);
      window.removeEventListener('open-ai-page', handleOpenAI);
      window.removeEventListener('open-chats-page', handleOpenChats);
      window.removeEventListener('open-profile-page', handleOpenProfile);
    };
  }, []);

  // Роутинг по /@username, /wall/post/:postId и ?user=username
  useEffect(() => {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    const usernameMatch = path.match(/^\/@(.+)$/);
    const hashtagMatch = path.match(/^\/wall\/hashtag\/(.+)$/);
    const postMatch = path.match(/^\/wall\/post\/(.+)$/);
    const queryUser = params.get('user');
    
    if (postMatch && user) {
      const postId = postMatch[1];
      setHighlightPostId(postId);
      setCurrentView('wall');
      window.history.replaceState({}, '', '/');
    } else if (hashtagMatch && user) {
      const tag = hashtagMatch[1];
      setHashtagTag(tag);
      setCurrentView('hashtag');
      window.history.replaceState({}, '', '/');
    } else if (usernameMatch && user) {
      const username = usernameMatch[1];
      api.searchUsers(username).then(users => {
        const foundUser = users.find(u => u.username === username);
        if (foundUser) {
          setProfileUserId(foundUser.id);
          setCurrentView('profile');
          window.history.replaceState({}, '', '/');
        }
      }).catch(console.error);
    } else if (queryUser && user) {
      api.searchUsers(queryUser).then(users => {
        const foundUser = users.find(u => u.username === queryUser);
        if (foundUser) {
          setProfileUserId(foundUser.id);
          setCurrentView('profile');
          window.history.replaceState({}, '', '/');
        }
      }).catch(console.error);
    }
  }, [user]);

  // Listen for beavers notifications via socket
  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    if (!socket) return;

    const handleBeaversReceived = (data: { fromDisplayName: string; fromUsername: string; amount: number; note?: string }) => {
      updateUser({ beavers: (user.beavers || 0) + data.amount });
      success(
        <span className="flex items-center gap-1">
          Вы получили {data.amount} бобров <BeaverIcon size={16} /> от {data.fromDisplayName || '@' + data.fromUsername}
          {data.note ? `: ${data.note}` : ''}
        </span>
      );
    };

    const handleBeaversTopup = (data: { amount: number; rubles: number }) => {
      updateUser({ beavers: (user.beavers || 0) + data.amount });
      success(
        <span className="flex items-center gap-1">
          Баланс пополнен на {data.amount} бобров <BeaverIcon size={16} /> ({data.rubles} ₽)
        </span>
      );
    };

    socket.on('beavers_received', handleBeaversReceived);
    socket.on('beavers_topup', handleBeaversTopup);

    return () => {
      socket.off('beavers_received', handleBeaversReceived);
      socket.off('beavers_topup', handleBeaversTopup);
    };
  }, [user?.id]);

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="h-full flex items-center justify-center bg-surface"
      >
        <div className="flex flex-col items-center gap-4">
          <НексоLoader size="lg" />
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-zinc-500 text-sm"
          >
            Загрузка...
          </motion.p>
        </div>
      </motion.div>
    );
  }

  return (
    <ErrorBoundary>
    <div className="h-full w-full flex flex-col">
      <ConnectionStatus />
      <AnimatePresence mode="wait">
        {token && user ? (
          <motion.div key="app" className="h-full w-full flex-1 min-h-0 flex flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {/* Main content */}
            <div className="flex-1 min-h-0 overflow-hidden flex">
              {/* Sidebar on desktop and mobile when no active chat - hide when on wall */}
              {currentView === 'chat' && (
                <div className={`${isMobile && activeChat ? 'hidden' : 'flex'} w-full sm:w-80 flex-shrink-0 border-r border-border overflow-hidden`}>
                  <Sidebar 
                    onOpenAI={() => {
                      window.dispatchEvent(new Event('open-ai-page'));
                    }}
                    onOpenFriends={() => {
                      setCurrentView('friends');
                    }}
                    onOpenWall={() => {
                      setCurrentView('wall');
                    }}
                  />
                </div>
              )}
              
              <div className={`${isMobile && currentView === 'chat' && !activeChat ? 'hidden' : 'flex'} flex-1 min-h-0 overflow-hidden`}>
                {currentView === 'hashtag' && hashtagTag ? (
                  <HashtagPage
                    tag={hashtagTag}
                    onClose={() => {
                      setCurrentView('wall');
                      setHashtagTag(null);
                    }}
                  />
                ) : currentView === 'profile' && profileUserId ? (
                  <div className="h-full bg-surface">
                    <UserProfile
                      userId={profileUserId}
                      isSelf={profileUserId === user.id}
                      onClose={() => {
                        setCurrentView('chat');
                        setProfileUserId(null);
                      }}
                    />
                  </div>
                ) : currentView === 'wall' ? (
                  <WallPage highlightPostId={highlightPostId} onHighlightCleared={() => setHighlightPostId(null)} />
                ) : currentView === 'friends' ? (
                  <FriendsPage onClose={() => setCurrentView('chat')} />
                ) : currentView === 'profile' ? (
                  <div className="h-full bg-surface">
                    <UserProfile
                      userId={user.id}
                      isSelf={true}
                      onClose={() => setCurrentView('chat')}
                    />
                  </div>
                ) : (
                  <ChatPage />
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div key="auth" className="h-full w-full flex-1 min-h-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <AuthPage />
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Mobile Bottom Navigation - только на мобильном */}
      {token && user && isMobile && (
        <MobileBottomNav
          currentView={(mobileFriendsOpen ? 'friends' : currentView) as MobileView}
          onNavigate={(view) => {
            if (view === 'friends') {
              setMobileFriendsOpen(true);
              return;
            }
            setMobileFriendsOpen(false);
            setCurrentView(view as AppView);
          }}
          onOpenAI={() => {
            if (currentViewRef.current === 'wall') {
              window.dispatchEvent(new Event('wall-open-ai'));
              return;
            }
            window.dispatchEvent(new Event('open-ai-page'));
          }}
          onOpenCreate={() => {
            window.dispatchEvent(new Event('open-new-chat'));
          }}
          onOpenProfile={() => {
            setMobileFriendsOpen(false);
            setProfileUserId(user.id);
            setCurrentView('profile');
          }}
        />
      )}

      {/* Mobile Friends Bottom Sheet */}
      <FriendsBottomSheet
        isOpen={mobileFriendsOpen}
        onClose={() => setMobileFriendsOpen(false)}
        isMobile={isMobile}
      />
      
      <ToastContainer />
      <MusicPlayer />
      <VoicePlayerBar />
      
      {/* Shared Folder Modal */}
      {sharedFolderToken && user && (
        <AcceptSharedFolderModal
          token={sharedFolderToken}
          onClose={() => {
            setSharedFolderToken(null);
            window.history.pushState({}, '', '/');
          }}
          onSuccess={() => {
            success('Папка успешно добавлена!');
            window.location.reload();
          }}
        />
      )}
    </div>
    </ErrorBoundary>
  );
}
