import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import mime from 'mime-types';
import { config } from './config';
import { prisma } from './db';
import authRoutes from './routes/auth';

// Initialize database connection
prisma.$connect().then(() => {
  console.log('  ✓ БД подключена');
}).catch(err => {
  console.error('Failed to connect DB:', err);
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
import { authenticateToken, authenticateTokenOrAdmin, AuthRequest } from './middleware/auth';
import { decryptFileToBuffer, isEncryptionEnabled } from './encrypt';
import { UPLOADS_ROOT } from './shared';
import { startSelfDestructCleanup } from './lib/selfDestructCleanup';
import { localStorage } from './lib/localStorage';
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

// REWRITE MIDDLEWARE (MUST BE FIRST)
// Rewrite /frontend-api-app -> / so all routes and static files work correctly
app.use((req, _res, next) => {
  if (req.url.startsWith('/frontend-api-app')) {
    const oldUrl = req.url;
    req.url = req.url.substring('/frontend-api-app'.length) || '/';
    console.log(`[REWRITE] ${oldUrl} -> ${req.url}`);
  }
  next();
});

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
  pingTimeout: 60000, // 60 секунд
  pingInterval: 25000, // 25 секунд
  upgradeTimeout: 30000,
  maxHttpBufferSize: 1e8, // 100 MB
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
  connectTimeout: 45000,
});

// Trust first proxy (Nginx) so req.ip returns real client IP from X-Forwarded-For
app.set('trust proxy', 1);

// SECURITY FIX: Улучшенные заголовки безопасности
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // TODO: Убрать unsafe-* в продакшене
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
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  hsts: {
    maxAge: 31536000, // 1 год
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
    if (config.corsOrigins.includes(origin) || config.corsOrigins.includes('*')) {
      return callback(null, true);
    }
    console.warn(`[CORS] Blocked origin: ${origin}`);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 600,
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting for auth endpoints (prevent brute-force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500, // Увеличен лимит для auth endpoints
  message: { error: 'Слишком много попыток, попробуйте позже' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Не применять rate limiting к /me, check-username, check-phone
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

// Redirect old /uploads/files/ paths to new API
app.get('/uploads/files/:fileId', (req, res) => {
  const { fileId } = req.params;
  console.log(`[FILES] Redirecting old path /uploads/files/${fileId} to /api/files/${fileId}/download`);
  res.redirect(301, `/api/files/${fileId}/download`);
});

// Endpoint для скачивания файлов из локального хранилища
app.get('/api/files/:fileId/download', async (req, res) => {
  try {
    const { fileId } = req.params;
    console.log(`[FILES] Download request: ${fileId}`);

    // CORS for media
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

    if (!fileId) {
      console.warn(`[FILES] Invalid fileId: ${fileId}`);
      res.status(400).json({ error: 'Неверный ID файла' });
      return;
    }

    // Try local storage first (new system)
    if (fileId.startsWith('local_')) {
      const localFile = await prisma.localFile.findUnique({
        where: { fileId },
        include: { chunks: { orderBy: { chunkIndex: 'asc' } } }
      });

      if (!localFile) {
        console.warn(`[FILES] File ${fileId} not found in DB`);
        res.status(404).json({ error: 'Файл не найден' });
        return;
      }

      if (!localFile.chunks || localFile.chunks.length === 0) {
        console.warn(`[FILES] File ${fileId} has no chunks`);
        res.status(404).json({ error: 'Файл повреждён (нет чанков)' });
        return;
      }

      console.log(`[FILES] File found: ${localFile.originalName} (${localFile.mimeType}, ${localFile.totalSize}b, ${localFile.chunks.length} chunks)`);

      let fileBuffer: Buffer;
      try {
        fileBuffer = await localStorage.downloadFile(localFile.fileId, localFile.chunks);
      } catch (downloadError: any) {
        console.error(`[FILES] Download error:`, downloadError.message);
        res.status(503).json({ error: 'Файл временно недоступен' });
        return;
      }

      console.log(`[FILES] File downloaded: ${fileBuffer.length}b`);

      await prisma.localFile.update({
        where: { fileId },
        data: { lastAccessed: new Date(), accessCount: { increment: 1 } }
      }).catch(() => {}); // ignore update errors

      const isInline = localFile.mimeType.startsWith('image/') ||
                       localFile.mimeType.startsWith('video/') ||
                       localFile.mimeType.startsWith('audio/');

      if (isInline) {
        res.setHeader('Content-Type', localFile.mimeType);
        res.setHeader('Content-Length', fileBuffer.length);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

        const range = req.headers.range;
        if (range) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileBuffer.length - 1;

          if (start >= fileBuffer.length) {
            res.writeHead(416, { 'Content-Range': `bytes */${fileBuffer.length}` });
            res.end();
            return;
          }

          const chunk = fileBuffer.slice(start, Math.min(end + 1, fileBuffer.length));
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${Math.min(end, fileBuffer.length - 1)}/${fileBuffer.length}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunk.length,
            'Content-Type': localFile.mimeType,
          });
          res.end(chunk);
        } else {
          res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(localFile.originalName)}"`);
          res.end(fileBuffer);
        }
      } else {
        res.setHeader('Content-Type', localFile.mimeType);
        res.setHeader('Content-Length', fileBuffer.length);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(localFile.originalName)}"`);
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        res.end(fileBuffer);
      }
      return;
    }

    res.status(400).json({ error: 'Неподдерживаемый тип файла' });

  } catch (error: any) {
    console.error('[FILES] Download error:', error.message, error.stack);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Ошибка скачивания: ' + error.message });
    }
  }
});

// Public endpoint for video notes file serving (no auth required)
app.get('/api/video-notes/file/:filename', async (req, res) => {
  try {
    const filename = String(req.params.filename);
    
    // Validate filename to prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    const path = require('path');
    const fs = require('fs/promises');
    const filePath = path.join(process.cwd(), 'uploads', 'video-notes', filename);

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'Video note not found' });
    }

    // Get file stats for Content-Length
    const stats = await fs.stat(filePath);

    // Support Range requests for video streaming
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunksize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/webm',
      });

      const stream = require('fs').createReadStream(filePath, { start, end });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stats.size,
        'Content-Type': 'video/webm',
      });

      const stream = require('fs').createReadStream(filePath);
      stream.pipe(res);
    }
  } catch (error) {
    console.error('Error serving video note:', error);
    res.status(500).json({ error: 'Failed to serve video note' });
  }
});

// API маршруты
// @ts-ignore
app.use('/api/auth', authLimiter, authRoutes);
// @ts-ignore
app.use('/api/users', apiLimiter, authenticateToken, userRoutes);
// @ts-ignore
app.use('/api/chats', apiLimiter, authenticateToken, chatRoutes);
// @ts-ignore
app.use('/api/stories', apiLimiter, authenticateToken, storyRoutes);
// @ts-ignore
app.use('/api/friends', apiLimiter, authenticateToken, friendRoutes);
// @ts-ignore
app.use('/api/call-logs', apiLimiter, authenticateToken, callLogRoutes);
// @ts-ignore
app.use('/api/messages', apiLimiter, authenticateToken, messageViewRoutes);
// @ts-ignore
app.use('/api/messages', apiLimiter, authenticateToken, messageRoutes);
// @ts-ignore
app.use('/api/threads', apiLimiter, authenticateToken, threadsRoutes);
// @ts-ignore
app.use('/api/ai', apiLimiter, authenticateToken, aiRoutes);
// @ts-ignore
app.use('/api/secret-chats', apiLimiter, authenticateToken, secretChatsRoutes);
// @ts-ignore
app.use('/api/stickers', apiLimiter, authenticateToken, stickersRoutes);
// @ts-ignore
app.use('/api/search', apiLimiter, authenticateToken, searchRoutes);
// @ts-ignore
app.use('/api/search/v2', apiLimiter, authenticateToken, searchEnhancedRoutes);
// @ts-ignore
app.use('/api/media', apiLimiter, authenticateToken, mediaRoutes);
// @ts-ignore
app.use('/api/webhooks', apiLimiter, authenticateToken, webhooksRoutes);
// @ts-ignore
app.use('/api/auto-responders', apiLimiter, authenticateToken, autoRespondersRoutes);
// @ts-ignore
app.use('/api/ocr', apiLimiter, authenticateToken, ocrRoutes);
// @ts-ignore
app.use('/api/speech-to-text', apiLimiter, authenticateToken, speechToTextRoutes);
// @ts-ignore
app.use('/api/self-destruct', apiLimiter, authenticateToken, selfDestructRoutes);
// @ts-ignore
app.use('/api/privacy', apiLimiter, authenticateToken, privacyRoutes);
// @ts-ignore
app.use('/api/customization', apiLimiter, authenticateToken, customizationRoutes);
// @ts-ignore
app.use('/api/folders', apiLimiter, authenticateToken, foldersRoutes);
// @ts-ignore
app.use('/api/tags', apiLimiter, authenticateToken, tagsRoutes);
// @ts-ignore
app.use('/api/quick-replies', apiLimiter, authenticateToken, quickRepliesRoutes);
// @ts-ignore
app.use('/api/utilities', apiLimiter, authenticateToken, utilitiesRoutes);
// @ts-ignore
app.use('/api/premium', apiLimiter, authenticateToken, premiumRoutes);
// @ts-ignore
// Video notes - GET requests are public, POST requires auth (handled in route)
app.use('/api/video-notes', apiLimiter, videoNotesRoutes);
// @ts-ignore
app.use('/api/status', apiLimiter, authenticateToken, statusRoutes);
// @ts-ignore
// Profile music - GET /file/:filename is public, other routes require auth (handled in route)
app.use('/api/profile-music', apiLimiter, profileMusicRoutes);
// @ts-ignore
app.use('/api/chat-backgrounds', apiLimiter, authenticateToken, chatBackgroundsRoutes);
// @ts-ignore
app.use('/api/custom-emojis', apiLimiter, authenticateToken, customEmojisRoutes);
// @ts-ignore
app.use('/api/cloud', apiLimiter, authenticateToken, cloudStorageRoutes);
// @ts-ignore
app.use('/api/channel-subscriptions', apiLimiter, authenticateToken, channelSubscriptionsRoutes);
// @ts-ignore
// Wallet routes - webhook is public (called by YooKassa), rest requires auth
// The router handles auth internally for the webhook endpoint
app.use('/api/wallet', apiLimiter, walletRoutes);
// @ts-ignore
app.use('/api/watch-party', apiLimiter, authenticateToken, watchPartyRoutes);
// @ts-ignore
app.use('/api/message-tags', apiLimiter, authenticateToken, messageTagsRoutes);
// @ts-ignore
app.use('/api/media-search', apiLimiter, authenticateToken, mediaSearchRoutes);
// @ts-ignore
app.use('/api/archive', apiLimiter, authenticateToken, archiveRoutes);
// @ts-ignore
// NFT routes - GET requests are public, POST/PUT/DELETE require auth (handled in route)
app.use('/api/nft', apiLimiter, nftRoutes);
// @ts-ignore
// Wall routes - feed and posts
app.use('/api/wall', apiLimiter, wallRoutes);
// @ts-ignore
app.use('/api/admin', apiLimiter, authenticateToken, adminRoutes);
// @ts-ignore
app.use('/api/devices', apiLimiter, authenticateToken, devicesRoutes);
// @ts-ignore
app.use('/api/bookmarks', apiLimiter, authenticateToken, bookmarksRoutes);
// @ts-ignore
app.use('/api/templates', apiLimiter, authenticateToken, templatesRoutes);
// @ts-ignore
app.use('/api/tasks', apiLimiter, authenticateToken, tasksRoutes);
// @ts-ignore
app.use('/api/calendar', apiLimiter, authenticateToken, calendarRoutes);
// @ts-ignore
app.use('/api/drawing-board', apiLimiter, authenticateToken, drawingBoardRoutes);
// @ts-ignore
app.use('/api/code-blocks', apiLimiter, authenticateToken, codeBlocksRoutes);
// @ts-ignore
app.use('/api/contacts', apiLimiter, authenticateToken, contactsRoutes);
// @ts-ignore
app.use('/api/badges', apiLimiter, badgesRoutes);
// @ts-ignore
app.use('/api/playlists', apiLimiter, playlistsRoutes);
// @ts-ignore
app.use('/api/drawing-chat', apiLimiter, drawingChatRoutes);
// @ts-ignore
app.use('/api/map-routes', apiLimiter, mapRoutesRoutes);
// @ts-ignore
app.use('/api/fake-password', apiLimiter, fakePasswordRoutes);
// @ts-ignore
app.use('/api/invoices', apiLimiter, authenticateToken, invoicesRoutes);
// @ts-ignore
app.use('/api/blocking', apiLimiter, authenticateToken, blockingRoutes);

// NEW FEATURES - STAGE 2
// @ts-ignore
app.use('/api/reactions', apiLimiter, authenticateToken, reactionsRoutes);
// @ts-ignore
app.use('/api/user-status', apiLimiter, authenticateToken, userStatusRoutes);
// @ts-ignore
app.use('/api/polls', apiLimiter, authenticateToken, pollsRoutes);
// @ts-ignore
app.use('/api/voice-rooms', apiLimiter, authenticateToken, voiceRoomsRoutes);
// @ts-ignore
app.use('/api/nft/collections', apiLimiter, authenticateToken, nftCollectionsRoutes);
// @ts-ignore
app.use('/api/nft/auctions', apiLimiter, authenticateToken, nftAuctionsRoutes);
// @ts-ignore
app.use('/api/nft/trades', apiLimiter, authenticateToken, nftTradesRoutes);
// @ts-ignore
app.use('/api/achievements', apiLimiter, authenticateToken, achievementsRoutes);

// NEW ADVANCED FEATURES
// @ts-ignore
app.use('/api/collaborative-docs', apiLimiter, authenticateToken, collaborativeDocsRoutes);
// @ts-ignore
app.use('/api/chat-notes', apiLimiter, authenticateToken, chatNotesRoutes);
// @ts-ignore
app.use('/api/disappearing-messages', apiLimiter, authenticateToken, disappearingMessagesRoutes);
// @ts-ignore
app.use('/api/donations', apiLimiter, authenticateToken, donationsRoutes);
// @ts-ignore
app.use('/api/marketplace', apiLimiter, authenticateToken, marketplaceRoutes);
// @ts-ignore
app.use('/api/collaborative-playlists', apiLimiter, authenticateToken, collaborativePlaylistsRoutes);
app.use('/api/music-playlists', apiLimiter, authenticateToken, musicPlaylistsRoutes);
// @ts-ignore
app.use('/api/live-streams', apiLimiter, authenticateToken, liveStreamsRoutes);
// @ts-ignore
app.use('/api/communities', apiLimiter, authenticateToken, communitiesRoutes);

// NEW FEATURES - Reports, Data Export, Call Recordings, Voice Transcripts, Chat Notifications
// @ts-ignore
app.use('/api/reports', apiLimiter, authenticateToken, reportsRoutes);
// @ts-ignore
app.use('/api/data-export', apiLimiter, authenticateToken, dataExportRoutes);
// @ts-ignore
app.use('/api/call-recordings', apiLimiter, authenticateToken, callRecordingsRoutes);
// @ts-ignore
app.use('/api/voice-transcripts', apiLimiter, authenticateToken, voiceTranscriptsRoutes);
// @ts-ignore
app.use('/api/chat-notifications', apiLimiter, authenticateToken, chatNotificationsRoutes);

// NEW FEATURES - Stage 3
// @ts-ignore
app.use('/api/premium-effects', apiLimiter, authenticateToken, premiumEffectsRoutes);
// @ts-ignore
app.use('/api/live-location', apiLimiter, authenticateToken, liveLocationRoutes);
// @ts-ignore
app.use('/api/private-media', apiLimiter, authenticateToken, privateMediaRoutes);
// @ts-ignore
app.use('/api/screen-share', apiLimiter, authenticateToken, screenShareRoutes);
// @ts-ignore
app.use('/api/plugins', apiLimiter, authenticateToken, widgetsRoutes);
// @ts-ignore
app.use('/api/story-polls', apiLimiter, authenticateToken, storyPollsRoutes);
// @ts-ignore
app.use('/api/channel-threads', apiLimiter, authenticateToken, channelThreadsRoutes);
// @ts-ignore
app.use('/api/dnd', apiLimiter, authenticateToken, doNotDisturbRoutes);
// @ts-ignore
app.use('/api/chat-export', apiLimiter, authenticateToken, chatExportRoutes);

// Проверка здоровья
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', name: 'Nexo Server' });
});

// Админ панель (ДОЛЖНА БЫТЬ ДО статических файлов!)
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'admin-panel.html'));
});

// NFT Studio админ панель
app.get('/admin/nft', (_req, res) => {
  res.sendFile(path.join(__dirname, 'admin-nft-studio.html'));
});

// Serve static files from web dist (../web/dist relative to src/)
const webDistPath = path.resolve(__dirname, '..', 'web', 'dist');
console.log('Serving web from:', webDistPath);
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
app.get('/api/ice-servers', authenticateToken, (_req: AuthRequest, res) => {
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
    // Silent cleanup
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
    // Silent cleanup
  }
}
cleanupExpiredDeviceTokens();
setInterval(cleanupExpiredDeviceTokens, 5 * 60 * 1000);

// Start server
server.listen(config.port, '0.0.0.0', () => {
  console.log(`\n  ⚡ Nexo Server запущен на порту ${config.port}\n`);
  console.log(`  📡 Локально: http://localhost:${config.port}`);
  console.log(`  🌐 В сети: http://<ваш-IP>:${config.port}\n`);
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
