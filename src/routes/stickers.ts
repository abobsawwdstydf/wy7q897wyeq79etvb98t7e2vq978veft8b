import express from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';
import multer from 'multer';

const router = express.Router();

// Multer for sticker uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

/**
 * Convert uploaded image to WebP sticker format (512x512 max)
 */
router.post('/convert', upload.single('image') as any, async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Return the file buffer info - actual conversion happens client-side
    // This endpoint validates and stores the converted sticker
    const isAnimated = req.file.mimetype === 'image/gif' || req.file.originalname.endsWith('.gif');

    res.json({
      success: true,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      isAnimated,
      message: 'File validated. Use client-side conversion for WebP.'
    });
  } catch (error) {
    console.error('Convert sticker error:', error);
    res.status(500).json({ error: 'Failed to process sticker' });
  }
});

/**
 * Get all public sticker packs
 */
router.get('/packs', async (_req: AuthRequest, res) => {
  try {
    const packs = await prisma.stickerPack.findMany({
      where: { isPublic: true },
      include: {
        stickers: {
          orderBy: { order: 'asc' },
          take: 1 // Just thumbnail
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(packs);
  } catch (error) {
    console.error('Get sticker packs error:', error);
    res.status(500).json({ error: 'Failed to get sticker packs' });
  }
});

/**
 * Get user's sticker packs
 */
router.get('/packs/my', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const packs = await prisma.stickerPack.findMany({
      where: { creatorId: userId },
      include: {
        stickers: {
          orderBy: { order: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(packs);
  } catch (error) {
    console.error('Get my sticker packs error:', error);
    res.status(500).json({ error: 'Failed to get sticker packs' });
  }
});

/**
 * Get stickers from a pack
 */
router.get('/packs/:packId/stickers', async (_req: AuthRequest, res) => {
  try {
    const packId = String(_req.params.packId);

    const stickers = await prisma.sticker.findMany({
      where: { packId },
      orderBy: { order: 'asc' }
    });

    res.json(stickers);
  } catch (error) {
    console.error('Get stickers error:', error);
    res.status(500).json({ error: 'Failed to get stickers' });
  }
});

/**
 * Create sticker pack
 */
router.post('/packs', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { name, description, isPublic, isAnimated } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Pack name required' });
    }

    const pack = await prisma.stickerPack.create({
      data: {
        name,
        description,
        creatorId: userId,
        isPublic: isPublic !== false,
        isAnimated: isAnimated === true
      }
    });

    res.json(pack);
  } catch (error) {
    console.error('Create sticker pack error:', error);
    res.status(500).json({ error: 'Failed to create sticker pack' });
  }
});

/**
 * Add sticker to pack
 */
router.post('/packs/:packId/stickers', upload.single('sticker') as any, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const packId = String(req.params.packId);
    const { emoji, fileUrl, width, height, isAnimated } = req.body;

    // Verify pack ownership
    const pack = await prisma.stickerPack.findUnique({
      where: { id: packId }
    });

    if (!pack || pack.creatorId !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (!fileUrl) {
      return res.status(400).json({ error: 'File URL required' });
    }

    // Get next order
    const lastSticker = await prisma.sticker.findFirst({
      where: { packId },
      orderBy: { order: 'desc' }
    });

    const order = lastSticker ? lastSticker.order + 1 : 0;

    const sticker = await prisma.sticker.create({
      data: {
        packId,
        emoji,
        fileUrl,
        fileSize: req.file?.size || 0,
        width: width ? parseInt(width) : null,
        height: height ? parseInt(height) : null,
        isAnimated: isAnimated === 'true',
        order
      }
    });

    res.json(sticker);
  } catch (error) {
    console.error('Add sticker error:', error);
    res.status(500).json({ error: 'Failed to add sticker' });
  }
});

/**
 * Delete sticker pack
 */
router.delete('/packs/:packId', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const packId = String(req.params.packId);

    const pack = await prisma.stickerPack.findUnique({
      where: { id: packId }
    });

    if (!pack || pack.creatorId !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await prisma.stickerPack.delete({
      where: { id: packId }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete sticker pack error:', error);
    res.status(500).json({ error: 'Failed to delete sticker pack' });
  }
});

/**
 * Search GIFs
 */
router.get('/gifs/search', async (req: AuthRequest, res) => {
  try {
    const { q, limit = 20, offset = 0 } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Search query required' });
    }

    const gifs = await prisma.gif.findMany({
      where: {
        OR: [
          { title: { contains: q } },
          { tags: { contains: q } }
        ]
      },
      orderBy: { searchCount: 'desc' },
      take: Number(limit),
      skip: Number(offset)
    });

    // Increment search count for found GIFs
    if (gifs.length > 0) {
      await prisma.gif.updateMany({
        where: { id: { in: gifs.map(g => g.id) } },
        data: { searchCount: { increment: 1 } }
      });
    }

    res.json(gifs);
  } catch (error) {
    console.error('Search GIFs error:', error);
    res.status(500).json({ error: 'Failed to search GIFs' });
  }
});

/**
 * Get trending GIFs
 */
router.get('/gifs/trending', async (_req: AuthRequest, res) => {
  try {
    const gifs = await prisma.gif.findMany({
      orderBy: { searchCount: 'desc' },
      take: 30
    });

    res.json(gifs);
  } catch (error) {
    console.error('Get trending GIFs error:', error);
    res.status(500).json({ error: 'Failed to get trending GIFs' });
  }
});

export default router;
