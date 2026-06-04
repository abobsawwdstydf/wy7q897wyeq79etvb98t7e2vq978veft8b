import express from 'express';
import multer from 'multer';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';
import { localStorage } from '../lib/localStorage';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/jpeg'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// GET /api/custom-emojis — get user's custom emojis
router.get('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const emojis = await prisma.customEmoji.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(emojis);
  } catch (error) {
    console.error('Get custom emojis error:', error);
    res.status(500).json({ error: 'Failed to get custom emojis' });
  }
});

// POST /api/custom-emojis — upload custom emoji
router.post('/', upload.single('file') as any, async (req: AuthRequest, res: express.Response) => {
  try {
    const userId = req.userId!;
    const { name, shortcode } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    if (!name?.trim() || !shortcode?.trim()) {
      return res.status(400).json({ error: 'Name and shortcode are required' });
    }

    // Validate shortcode format
    if (!/^[a-z0-9_]+$/.test(shortcode)) {
      return res.status(400).json({ error: 'Shortcode must contain only lowercase letters, numbers, and underscores' });
    }

    // Check for duplicate shortcode
    const existing = await prisma.customEmoji.findUnique({
      where: { userId_shortcode: { userId, shortcode } },
    });
    if (existing) {
      return res.status(409).json({ error: 'Shortcode already exists' });
    }

    // Save file using localStorage
    const result = await localStorage.uploadFile(
      req.file.buffer,
      req.file.originalname || `${shortcode}.png`,
      req.file.mimetype,
      userId,
    );

    // Save LocalFile record to DB
    await prisma.localFile.create({
      data: {
        fileId: result.fileId,
        userId,
        originalName: result.originalName,
        mimeType: result.mimeType,
        totalSize: result.totalSize,
        storagePath: result.storagePath,
        encryptionLevel: result.encryptionLevel,
        chunks: {
          create: result.chunks.map(chunk => ({
            fileId: result.fileId,
            chunkIndex: chunk.chunkIndex,
            path: chunk.path,
            size: chunk.size,
          })),
        },
      },
    });

    const emoji = await prisma.customEmoji.upsert({
      where: { userId_shortcode: { userId, shortcode: shortcode.trim() } },
      create: {
        userId,
        name: name.trim(),
        shortcode: shortcode.trim(),
        url: `/api/files/${result.fileId}/download`,
        fileId: result.fileId,
      },
      update: {
        name: name.trim(),
        url: `/api/files/${result.fileId}/download`,
        fileId: result.fileId,
      },
    });

    res.json(emoji);
  } catch (error) {
    console.error('Upload custom emoji error:', error);
    res.status(500).json({ error: 'Failed to upload emoji' });
  }
}, (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Multer error handler
  console.error('Multer error:', err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large (max 2MB)' });
  }
  res.status(400).json({ error: err.message || 'Upload failed' });
});

// DELETE /api/custom-emojis/:id — delete custom emoji
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const id = String(req.params.id);

    const emoji = await prisma.customEmoji.findFirst({
      where: { id, userId },
    });

    if (!emoji) {
      return res.status(404).json({ error: 'Emoji not found' });
    }

    await prisma.customEmoji.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete custom emoji error:', error);
    res.status(500).json({ error: 'Failed to delete emoji' });
  }
});

export default router;
