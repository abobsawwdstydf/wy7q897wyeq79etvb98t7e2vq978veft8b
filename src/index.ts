import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { config } from './config';
import { prisma } from './db';
import { initTUI, log } from './lib/tui';
import authRoutes from './routes/auth';
import filesRoutes from './routes/files';

// Initialize TUI dashboard (intercepts console.log/warn/error)
initTUI();

// Initialize database connection
prisma.$connect().then(() => {
  log('ok', 'Database connected');
}).catch(err => {
  log('error', `Failed to connect DB: ${err}`);
  process.exit(1);
});
import userRoutes from './routes/users';
import chatRoutes from './routes/chats';
import messageRoutes from './routes/messages';
import storyRoutes from './routes/stories';
import friendRoutes from './routes/friends';
import callLogRoutes from './routes/callLogs';
import messageViewRoutes from './routes/messageViews';
import adminRoutes from './routes/admin';
import { setupSocket } from './socket';
import { authenticateToken } from './middleware/auth';
import { UPLOADS_ROOT } from './shared';
import { startSelfDestructCleanup } from './lib/selfDestructCleanup';
import threadsRoutes from './routes/threads';
import aiRoutes from './routes/ai';
import secretChatsRoutes from './routes/secretChats';
import stickersRoutes from './routes/stickers';
import searchRoutes from './routes/search';
import searchEnhancedRoutes from './routes/searchEnhanced';
import mediaRoutes from './routes/media';
import webhooksRoutes from './routes/webhooks';
import autoRespondersRoutes from './routes/autoResponders';
import ocrRoutes from './routes/ocr';
import speechToTextRoutes from './routes/speechToText';
import selfDestructRoutes from './routes/selfDestruct';
import privacyRoutes from './routes/privacy';
import customizationRoutes from './routes/customization';
import foldersRoutes from './routes/folders';
import tagsRoutes from './routes/tags';
import quickRepliesRoutes from './routes/quickReplies';
import utilitiesRoutes from './routes/utilities';
import premiumRoutes from './routes/premium';
import videoNotesRoutes from './routes/videoNotes';
import statusRoutes from './routes/status';
import profileMusicRoutes from './routes/profileMusic';
import chatBackgroundsRoutes from './routes/chatBackgrounds';
import customEmojisRoutes from './routes/customEmojis';
import cloudStorageRoutes from './routes/cloudStorage';
import channelSubscriptionsRoutes from './routes/channelSubscriptions';
import walletRoutes from './routes/wallet';
import watchPartyRoutes from './routes/watchParty';
import messageTagsRoutes from './routes/messageTags';
import mediaSearchRoutes from './routes/mediaSearch';
import archiveRoutes from './routes/archive';
import nftRoutes from './routes/nft';
import devicesRoutes from './routes/devices';
import bookmarksRoutes from './routes/bookmarks';
import templatesRoutes from './routes/templates';
import tasksRoutes from './routes/tasks';
import calendarRoutes from './routes/calendar';
import drawingBoardRoutes from './routes/drawingBoard';
import codeBlocksRoutes from './routes/codeBlocks';
import contactsRoutes from './routes/contacts';
import badgesRoutes from './routes/badges';
import playlistsRoutes from './routes/playlists';
import drawingChatRoutes from './routes/drawingChat';
import mapRoutesRoutes from './routes/mapRoutes';
import fakePasswordRoutes from './routes/fakePassword';
import wallRoutes from './routes/wall';
import invoicesRoutes from './routes/invoices';
import blockingRoutes from './routes/blocking';
import reactionsRoutes from './routes/reactions';
import userStatusRoutes from './routes/userStatus';
import pollsRoutes from './routes/polls';
import voiceRoomsRoutes from './routes/voiceRooms';
import nftCollectionsRoutes from './routes/nftCollections';
import nftAuctionsRoutes from './routes/nftAuctions';
import nftTradesRoutes from './routes/nftTrades';
import achievementsRoutes from './routes/achievements';
import collaborativeDocsRoutes from './routes/collaborativeDocs';
import chatNotesRoutes from './routes/chatNotes';
import disappearingMessagesRoutes from './routes/disappearingMessages';
import donationsRoutes from './routes/donations';
import marketplaceRoutes from './routes/marketplace';
import collaborativePlaylistsRoutes from './routes/collaborativePlaylists';
import musicPlaylistsRoutes from './routes/musicPlaylists';
import liveStreamsRoutes from './routes/liveStreams';
import communitiesRoutes from './routes/communities';
import reportsRoutes from './routes/reports';
import dataExportRoutes from './routes/dataExport';
import callRecordingsRoutes from './routes/callRecordings';
import voiceTranscriptsRoutes from './routes/voiceTranscripts';
import chatNotificationsRoutes from './routes/chatNotifications';
import premiumEffectsRoutes from './routes/premiumEffects';
import liveLocationRoutes from './routes/liveLocation';
import privateMediaRoutes from './routes/privateMedia';
import screenShareRoutes from './routes/screenShare';
import widgetsRoutes from './routes/widgets';
import storyPollsRoutes from './routes/storyPolls';
import channelThreadsRoutes from './routes/channelThreads';
import doNotDisturbRoutes from './routes/doNotDisturb';
import chatExportRoutes from './routes/chatExport';

// Keep logs in production for debugging - use structured logging in production
// if (process.env.NODE_ENV === 'production') {
//   console.log = () => {};
//   console.warn = () => {};
// }

const app = express();


const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
  pingTimeout: 60000, // 60 секунд
  pingInterval: 25000, // 25 секунд
  upgradeTimeout: 30000,
  maxHttpBufferSize: 5e6, // 5 MB - enough for file metadata, not raw uploads
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
  connectTimeout: 45000,
});

// Trust first proxy (Nginx) so req.ip returns real client IP from X-Forwarded-For
app.set('trust proxy', 1);

// SECURITY FIX: Улучшенные заголовки безопасности
const isDev = process.env.NODE_ENV !== 'production';
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: isDev
        ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"]
        : ["'self'", "'unsafe-inline'"], // unsafe-inline для Vue приложения
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      mediaSrc: ["'self'", "blob:", "https:"],
      connectSrc: ["'self'", "wss:", "https:"],
      frameSrc: ["'self'", "https://www.openstreetmap.org"],
      childSrc: ["'self'", "https://www.openstreetmap.org"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: !isDev ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'no-referrer' },
}));

// CORS — ограничиваем по whitelist из config.corsOrigins (НЕ wildcard в продакшене)
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (config.corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.warn(`[CORS] Blocked origin: ${origin}`);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-CSRF-Token'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 600,
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// General auth rate limiting (more generous for non-sensitive endpoints)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: 'Слишком много запросов, попробуйте позже' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return req.path === '/me' || req.path === '/check-username' || req.path === '/check-phone';
  },
});

// SECURITY FIX: Rate limiting (разумный лимит для production)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 1000, // 1000 запросов/минуту - разумный лимит
  message: { error: 'Слишком много запросов, попробуйте позже' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Исключаем критичные endpoints
    const criticalPaths = [
      '/api/auth/me',
      '/api/users/settings',
      '/api/stories',
      '/api/health',
    ];
    return criticalPaths.some(path => req.path === path);
  },
  handler: (req, res) => {
    console.warn(`[RATE LIMIT] Exceeded for ${req.ip}: ${req.path}`);
    res.status(429).json({ 
      error: 'Слишком много запросов. Пожалуйста, подождите минуту.',
      retryAfter: 60 
    });
  },
});

// File serving routes (public endpoints - auth if needed handled inside)
app.use('/api', filesRoutes);

// API маршруты
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', apiLimiter, authenticateToken, userRoutes);
app.use('/api/chats', apiLimiter, authenticateToken, chatRoutes);
app.use('/api/stories', apiLimiter, authenticateToken, storyRoutes);
app.use('/api/friends', apiLimiter, authenticateToken, friendRoutes);
app.use('/api/call-logs', apiLimiter, authenticateToken, callLogRoutes);
app.use('/api/messages', apiLimiter, authenticateToken, messageRoutes);
app.use('/api/message-views', apiLimiter, authenticateToken, messageViewRoutes);
app.use('/api/threads', apiLimiter, authenticateToken, threadsRoutes);
app.use('/api/ai', apiLimiter, authenticateToken, aiRoutes);
app.use('/api/secret-chats', apiLimiter, authenticateToken, secretChatsRoutes);
app.use('/api/stickers', apiLimiter, authenticateToken, stickersRoutes);
app.use('/api/search', apiLimiter, authenticateToken, searchRoutes);
app.use('/api/search/v2', apiLimiter, authenticateToken, searchEnhancedRoutes);
app.use('/api/media', apiLimiter, authenticateToken, mediaRoutes);
app.use('/api/webhooks', apiLimiter, authenticateToken, webhooksRoutes);
app.use('/api/auto-responders', apiLimiter, authenticateToken, autoRespondersRoutes);
app.use('/api/ocr', apiLimiter, authenticateToken, ocrRoutes);
app.use('/api/speech-to-text', apiLimiter, authenticateToken, speechToTextRoutes);
app.use('/api/self-destruct', apiLimiter, authenticateToken, selfDestructRoutes);
app.use('/api/privacy', apiLimiter, authenticateToken, privacyRoutes);
app.use('/api/customization', apiLimiter, authenticateToken, customizationRoutes);
app.use('/api/folders', apiLimiter, authenticateToken, foldersRoutes);
app.use('/api/tags', apiLimiter, authenticateToken, tagsRoutes);
app.use('/api/quick-replies', apiLimiter, authenticateToken, quickRepliesRoutes);
app.use('/api/utilities', apiLimiter, authenticateToken, utilitiesRoutes);
app.use('/api/premium', apiLimiter, authenticateToken, premiumRoutes);
app.use('/api/video-notes', apiLimiter, videoNotesRoutes);
app.use('/api/status', apiLimiter, authenticateToken, statusRoutes);
app.use('/api/profile-music', apiLimiter, profileMusicRoutes);
app.use('/api/chat-backgrounds', apiLimiter, authenticateToken, chatBackgroundsRoutes);
app.use('/api/custom-emojis', apiLimiter, authenticateToken, customEmojisRoutes);
app.use('/api/cloud', apiLimiter, authenticateToken, cloudStorageRoutes);
app.use('/api/channel-subscriptions', apiLimiter, authenticateToken, channelSubscriptionsRoutes);
app.use('/api/wallet', apiLimiter, walletRoutes);
app.use('/api/watch-party', apiLimiter, authenticateToken, watchPartyRoutes);
app.use('/api/message-tags', apiLimiter, authenticateToken, messageTagsRoutes);
app.use('/api/media-search', apiLimiter, authenticateToken, mediaSearchRoutes);
app.use('/api/archive', apiLimiter, authenticateToken, archiveRoutes);
app.use('/api/nft', apiLimiter, nftRoutes);
app.use('/api/wall', apiLimiter, wallRoutes);
app.use('/api/admin', apiLimiter, authenticateToken, adminRoutes);
app.use('/api/devices', apiLimiter, authenticateToken, devicesRoutes);
app.use('/api/bookmarks', apiLimiter, authenticateToken, bookmarksRoutes);
app.use('/api/templates', apiLimiter, authenticateToken, templatesRoutes);
app.use('/api/tasks', apiLimiter, authenticateToken, tasksRoutes);
app.use('/api/calendar', apiLimiter, authenticateToken, calendarRoutes);
app.use('/api/drawing-board', apiLimiter, authenticateToken, drawingBoardRoutes);
app.use('/api/code-blocks', apiLimiter, authenticateToken, codeBlocksRoutes);
app.use('/api/contacts', apiLimiter, authenticateToken, contactsRoutes);
app.use('/api/badges', apiLimiter, badgesRoutes);
app.use('/api/playlists', apiLimiter, playlistsRoutes);
app.use('/api/drawing-chat', apiLimiter, drawingChatRoutes);
app.use('/api/map-routes', apiLimiter, mapRoutesRoutes);
app.use('/api/fake-password', apiLimiter, fakePasswordRoutes);
app.use('/api/invoices', apiLimiter, authenticateToken, invoicesRoutes);
app.use('/api/blocking', apiLimiter, authenticateToken, blockingRoutes);

// NEW FEATURES - STAGE 2
app.use('/api/reactions', apiLimiter, authenticateToken, reactionsRoutes);
app.use('/api/user-status', apiLimiter, authenticateToken, userStatusRoutes);
app.use('/api/polls', apiLimiter, authenticateToken, pollsRoutes);
app.use('/api/voice-rooms', apiLimiter, authenticateToken, voiceRoomsRoutes);
app.use('/api/nft/collections', apiLimiter, authenticateToken, nftCollectionsRoutes);
app.use('/api/nft/auctions', apiLimiter, authenticateToken, nftAuctionsRoutes);
app.use('/api/nft/trades', apiLimiter, authenticateToken, nftTradesRoutes);
app.use('/api/achievements', apiLimiter, authenticateToken, achievementsRoutes);

// NEW ADVANCED FEATURES
app.use('/api/collaborative-docs', apiLimiter, authenticateToken, collaborativeDocsRoutes);
app.use('/api/chat-notes', apiLimiter, authenticateToken, chatNotesRoutes);
app.use('/api/disappearing-messages', apiLimiter, authenticateToken, disappearingMessagesRoutes);
app.use('/api/donations', apiLimiter, authenticateToken, donationsRoutes);
app.use('/api/marketplace', apiLimiter, authenticateToken, marketplaceRoutes);
app.use('/api/collaborative-playlists', apiLimiter, authenticateToken, collaborativePlaylistsRoutes);
app.use('/api/music-playlists', apiLimiter, authenticateToken, musicPlaylistsRoutes);
app.use('/api/live-streams', apiLimiter, authenticateToken, liveStreamsRoutes);
app.use('/api/communities', apiLimiter, authenticateToken, communitiesRoutes);

// NEW FEATURES - Reports, Data Export, Call Recordings, Voice Transcripts, Chat Notifications
app.use('/api/reports', apiLimiter, authenticateToken, reportsRoutes);
app.use('/api/data-export', apiLimiter, authenticateToken, dataExportRoutes);
app.use('/api/call-recordings', apiLimiter, authenticateToken, callRecordingsRoutes);
app.use('/api/voice-transcripts', apiLimiter, authenticateToken, voiceTranscriptsRoutes);
app.use('/api/chat-notifications', apiLimiter, authenticateToken, chatNotificationsRoutes);

// NEW FEATURES - Stage 3
app.use('/api/premium-effects', apiLimiter, authenticateToken, premiumEffectsRoutes);
app.use('/api/live-location', apiLimiter, authenticateToken, liveLocationRoutes);
app.use('/api/private-media', apiLimiter, authenticateToken, privateMediaRoutes);
app.use('/api/screen-share', apiLimiter, authenticateToken, screenShareRoutes);
app.use('/api/plugins', apiLimiter, authenticateToken, widgetsRoutes);
app.use('/api/story-polls', apiLimiter, authenticateToken, storyPollsRoutes);
app.use('/api/channel-threads', apiLimiter, authenticateToken, channelThreadsRoutes);
app.use('/api/dnd', apiLimiter, authenticateToken, doNotDisturbRoutes);
app.use('/api/chat-export', apiLimiter, authenticateToken, chatExportRoutes);

// Проверка здоровья
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', name: 'Nexo Server' });
});

// Админ панель (ДОЛЖНА БЫТЬ ДО статических файлов!)
app.get('/admin', authenticateToken, (_req, res) => {
  res.sendFile(path.join(__dirname, 'admin-panel.html'));
});

// NFT Studio админ панель
app.get('/admin/nft', authenticateToken, (_req, res) => {
  res.sendFile(path.join(__dirname, 'admin-nft-studio.html'));
});

// Serve static files from web dist (../web/dist relative to src/)
const webDistPath = path.resolve(__dirname, '..', 'web', 'dist');
log('info', `Serving web from: ${webDistPath}`);
app.use(express.static(webDistPath));

// Serve public files (badges, etc.)
const publicPath = path.resolve(__dirname, '..', 'web', 'public');
app.use(express.static(publicPath));

// SECURITY FIX: Безопасная раздача загруженных файлов
app.use('/uploads', express.static(UPLOADS_ROOT, {
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    // SECURITY FIX: Убран wildcard CORS
    // res.setHeader('Access-Control-Allow-Origin', '*');
    
    // SECURITY FIX: Предотвращение выполнения скриптов из загруженных файлов
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'unsafe-inline';");
    
    // SECURITY FIX: Для HTML/SVG файлов принудительно скачивание
    const ext = filePath.split('.').pop()?.toLowerCase();
    if (ext === 'html' || ext === 'svg' || ext === 'xml') {
      res.setHeader('Content-Disposition', 'attachment');
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
  },
  // SECURITY FIX: Отключаем directory listing
  index: false,
  dotfiles: 'deny',
}));

// Error handler for API routes (must be before SPA fallback)
app.use('/api', (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('API Error:', err);
  
  // Handle multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large' });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ error: 'Too many files' });
  }
  if (err.code === 'LIMIT_PART_COUNT') {
    return res.status(400).json({ error: 'Too many parts' });
  }
  if (err.code === 'LIMIT_FIELD_KEY') {
    return res.status(400).json({ error: 'Field name too long' });
  }
  if (err.code === 'LIMIT_FIELD_VALUE') {
    return res.status(400).json({ error: 'Field value too long' });
  }
  if (err.code === 'LIMIT_FIELD_COUNT') {
    return res.status(400).json({ error: 'Too many fields' });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Unexpected file field' });
  }
  
  res.status(err.status || 500).json({ 
    error: err.message || 'Internal server error',
    status: err.status || 500 
  });
});

// 404 handler for API routes (must be before SPA fallback)
app.use('/api', (_req: express.Request, res: express.Response) => {
  res.status(404).json({ error: 'API endpoint not found', status: 404 });
});

// SPA fallback - serve index.html for all other routes
app.get('*', (_req, res) => {
  const indexPath = path.join(webDistPath, 'index.html');
  if (!fs.existsSync(indexPath)) {
    return res.status(503).send(
      '<h1>Frontend not built</h1><p>Run <code>npm run build</code> inside <code>apps/server/web</code> to generate the dist folder.</p>'
    );
  }
  res.sendFile(indexPath);
});

// ICE серверы для WebRTC звонков
app.get('/api/ice-servers', authenticateToken, (_req: express.Request, res) => {
  const iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> = [];

  if (config.stunUrls.length > 0) {
    iceServers.push({ urls: config.stunUrls });
  }

  // TURN сервер с временными credentials (coturn --use-auth-secret)
  // SECURITY: TTL сокращён до 1 часа вместо 24, чтобы уменьшить окно перехвата
  if (config.turnUrl && config.turnSecret) {
    const ttl = 3600; // 1 час
    const timestamp = Math.floor(Date.now() / 1000) + ttl;
    const username = `${timestamp}:nexo`;
    const credential = crypto
      .createHmac('sha1', config.turnSecret)
      .update(username)
      .digest('base64');

    iceServers.push({
      urls: config.turnUrl,
      username,
      credential,
    });
  }

  res.json({ iceServers });
});

// Socket.io
setupSocket(io);

// При старте сервера сбросить всех в offline
prisma.user.updateMany({ data: { isOnline: false, lastSeen: new Date() } })
  .then(() => console.log('  ✔ Все пользователи сброшены в offline'))
  .catch((e: unknown) => console.error('Ошибка сброса онлайн-статусов:', e));

// Cleanup expired stories (every 10 minutes)
import { deleteUploadedFile } from './shared';

async function cleanupExpiredStories() {
  try {
    const expired = await prisma.story.findMany({
      where: { expiresAt: { lte: new Date() } },
      select: { id: true, mediaUrl: true },
    });

    if (expired.length === 0) return;

    for (const story of expired) {
      if (story.mediaUrl) deleteUploadedFile(story.mediaUrl);
    }

    const ids = expired.map(s => s.id);
    // Cascade handles StoryView deletion via schema onDelete: Cascade
    await prisma.story.deleteMany({ where: { id: { in: ids } } });
  } catch (e) {
    console.error('Failed to cleanup expired stories:', e);
  }
}

cleanupExpiredStories();
setInterval(cleanupExpiredStories, 10 * 60 * 1000);

// Start self-destruct message cleanup
startSelfDestructCleanup();

// Start NFT stock price updater
import { startNFTStockUpdater } from './lib/nftStockUpdater';
startNFTStockUpdater();

// Cleanup expired device tokens (every 5 minutes)
async function cleanupExpiredDeviceTokens() {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const deleted = await prisma.deviceToken.deleteMany({
      where: {
        createdAt: { lt: fiveMinutesAgo },
        status: { in: ['pending', 'denied'] },
      },
    });
    if (deleted.count > 0) {
      console.log(`[DEVICE AUTH] Cleaned up ${deleted.count} expired device tokens`);
    }
  } catch {
    console.error('Failed to cleanup expired device tokens');
  }
}
cleanupExpiredDeviceTokens();
setInterval(cleanupExpiredDeviceTokens, 5 * 60 * 1000);

// Start server
server.listen(config.port, '0.0.0.0', () => {
  log('ok', `Server started on port ${config.port}`);
  log('info', `Local: http://localhost:${config.port}`);
  log('info', `Network: http://<your-ip>:${config.port}`);
});

// Graceful shutdown
const shutdown = async () => {
  await prisma.$disconnect();
  server.close(() => {
    process.exit(0);
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
