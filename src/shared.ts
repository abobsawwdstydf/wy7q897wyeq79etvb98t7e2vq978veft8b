import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response, NextFunction } from 'express';
import { encryptFileInPlace, isEncryptionEnabled } from './encrypt';

// ─── Prisma select objects ────────────────────────────────────────────

/** Standard user fields to include in API responses (excludes password) */
export const USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  phone: true,
  phoneVerified: true,
  email: true,
  emailVerified: true,
  avatar: true,
  bio: true,
  birthday: true,
  isOnline: true,
  lastSeen: true,
  createdAt: true,
  hideStoryViews: true,
  pushSubscription: true,
  pinnedChannelId: true,
  notifyAll: true,
  notifyMessages: true,
  notifyCalls: true,
  notifyFriends: true,
  // Verification
  isVerified: true,
  verifiedBadgeUrl: true,
  verifiedBadgeType: true,
  verifiedAt: true,
  // Tag
  tagText: true,
  tagColor: true,
  tagStyle: true,
  // Wallet / beavers
  beavers: true,
  totalSpent: true,
  totalEarned: true,
  // Premium
  isPremium: true,
  premiumUntil: true,
  pinnedChannel: {
    select: {
      id: true,
      name: true,
      username: true,
      avatar: true,
      description: true,
      members: {
        select: {
          userId: true
        }
      }
    }
  }
} as const;

/** Compact user fields for message sender / forwarded-from */
export const SENDER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
  isVerified: true,
  verifiedBadgeUrl: true,
  verifiedBadgeType: true,
  tagText: true,
  tagColor: true,
  tagStyle: true,
} as const;

/** Full message include for API responses */
export const MESSAGE_INCLUDE = {
  sender: { select: SENDER_SELECT },
  forwardedFrom: { select: SENDER_SELECT },
  replyTo: {
    include: { sender: { select: { id: true, username: true, displayName: true } } },
  },
  media: true,
  reactions: {
    include: { user: { select: { id: true, username: true, displayName: true } } },
  },
  readBy: { select: { userId: true } },
} as const;

// ─── File system helpers ──────────────────────────────────────────────

const uploadsRoot = path.join(__dirname, '../uploads');

/** Ensure a directory exists (recursive). */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/** Safely delete a file from the uploads directory given its URL path (e.g. '/uploads/avatars/abc.jpg'). */
export function deleteUploadedFile(urlPath: string): void {
  if (!urlPath) return;
  try {
    const filename = urlPath.replace(/^\/uploads\//, '');
    const filePath = path.resolve(uploadsRoot, filename);

    // Path containment check — prevent directory traversal
    // SECURITY: используем path.relative + case-insensitive comparison для Windows
    const normalizedRoot = path.resolve(uploadsRoot);
    const normalizedFile = path.resolve(filePath);
    const isWindows = process.platform === 'win32';
    const root = isWindows ? normalizedRoot.toLowerCase() : normalizedRoot;
    const file = isWindows ? normalizedFile.toLowerCase() : normalizedFile;
    const rel = path.relative(root, file);

    if (rel.startsWith('..') || path.isAbsolute(rel) || rel === '') {
      console.error('Path traversal attempt blocked:', urlPath);
      return;
    }

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (e) {
    console.error('Failed to delete file:', urlPath, e);
  }
}

// ─── Multer configurations ───────────────────────────────────────────

const avatarsDir = path.join(uploadsRoot, 'avatars');
ensureDir(avatarsDir);
ensureDir(uploadsRoot);

/** Allowed image extensions for avatars. */
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);

function createAvatarStorage(prefix = '') {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, avatarsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${prefix}${uuidv4()}${ext}`);
    },
  });
}

/** Multer middleware for user avatar uploads (max 5MB, images only). */
export const uploadUserAvatar = multer({
  storage: createAvatarStorage(''),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype.startsWith('image/') && ALLOWED_IMAGE_EXTENSIONS.has(ext)) cb(null, true);
    else cb(new Error('Только изображения (jpg, png, gif, webp, avif)'));
  },
});

/** Multer middleware for group avatar uploads (max 5MB, images only). */
export const uploadGroupAvatar = multer({
  storage: createAvatarStorage('group-'),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype.startsWith('image/') && ALLOWED_IMAGE_EXTENSIONS.has(ext)) cb(null, true);
    else cb(new Error('Только изображения (jpg, png, gif, webp, avif)'));
  },
});

/** Blocked file extensions that could be served as executable content. */
const _BLOCKED_EXTENSIONS = new Set([
  '.html', '.htm', '.svg', '.xml', '.xhtml',
  '.php', '.jsp', '.asp', '.aspx', '.cgi',
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.pif',
  '.sh', '.bash', '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh',
  '.dll', '.sys', '.drv',
  '.hta', '.cpl', '.inf', '.reg',
]);

/** Multer middleware for general file uploads (max 100MB, reasonable file count). 
 * Uses memory storage - files are kept in RAM temporarily during upload processing.
 */
export const uploadFile = multer({
  storage: multer.memoryStorage(), // Store in memory buffer, NOT on disk
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB
    files: 20, // Max 20 files per request (for album support)
  },
  fileFilter: (_req, _file, cb) => {
    // All file types are allowed
    cb(null, true);
  },
});

// ─── Post-upload file encryption middleware ───────────────────────────

/**
 * Express middleware that encrypts an uploaded file in-place after multer
 * has written it to disk. Use after any multer middleware.
 */
export function encryptUploadedFile(req: Request, _res: Response, next: NextFunction): void {
  if (!isEncryptionEnabled()) return next();

  try {
    // Single file upload (req.file)
    if (req.file) {
      encryptFileInPlace(req.file.path);
    }
    // Multiple files (req.files) — handle both array and field-keyed forms
    if (req.files) {
      const files = Array.isArray(req.files)
        ? req.files
        : Object.values(req.files).flat();
      for (const file of files) {
        encryptFileInPlace(file.path);
      }
    }
  } catch (e) {
    console.error('File encryption error:', e);
    // Don't block the request — file is already saved, just unencrypted
  }

  next();
}

/** Absolute path to the uploads root directory. */
export const UPLOADS_ROOT = uploadsRoot;
