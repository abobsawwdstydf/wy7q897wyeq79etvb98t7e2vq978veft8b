import express from 'express';
import multer from 'multer';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';
import { localStorage } from '../lib/localStorage';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max per file
});

// GET /api/cloud — list files
router.get('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const folder = String(req.query.folder || '/');
    const search = req.query.search as string | undefined;

    const where: any = { userId };
    if (search) {
      where.name = { contains: search };
    } else {
      where.folder = folder;
    }

    const files = await prisma.cloudFile.findMany({
      where,
      orderBy: [{ isStarred: 'desc' }, { createdAt: 'desc' }],
    });

    // Get storage stats
    const stats = await prisma.cloudFile.aggregate({
      where: { userId },
      _sum: { size: true },
      _count: { id: true },
    });

    res.json({
      files,
      stats: {
        totalFiles: stats._count.id,
        totalSize: stats._sum.size || 0,
        maxSize: 12 * 1024 * 1024 * 1024, // 12GB limit
      },
    });
  } catch (error) {
    console.error('Cloud storage list error:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// POST /api/cloud/upload — upload file
router.post('/upload', upload.single('file') as any, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const folder = String(req.body.folder || '/');

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Check storage limit (5GB)
    const stats = await prisma.cloudFile.aggregate({
      where: { userId },
      _sum: { size: true },
    });
    const usedBytes = stats._sum.size || 0;
    const maxBytes = 12 * 1024 * 1024 * 1024;
    if (usedBytes + req.file.size > maxBytes) {
      return res.status(413).json({ error: 'Storage limit exceeded (12GB)' });
    }

    // Fix multer latin1 encoding for non-ASCII filenames (e.g. Cyrillic)
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    // Upload file
    const result = await localStorage.uploadFile(
      req.file.buffer,
      originalName,
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

    const cloudFile = await prisma.cloudFile.create({
      data: {
        userId,
        name: originalName,
        url: `/api/files/${result.fileId}/download`,
        mimeType: req.file.mimetype,
        size: req.file.size,
        folder,
      },
    });

    res.json(cloudFile);
  } catch (error) {
    console.error('Cloud upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// PUT /api/cloud/:id — rename or move file
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const id = String(req.params.id);
    const { name, folder, isStarred } = req.body;

    const file = await prisma.cloudFile.findFirst({ where: { id, userId } });
    if (!file) return res.status(404).json({ error: 'File not found' });

    const updated = await prisma.cloudFile.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(folder !== undefined && { folder }),
        ...(isStarred !== undefined && { isStarred }),
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Cloud update error:', error);
    res.status(500).json({ error: 'Failed to update file' });
  }
});

// DELETE /api/cloud/:id — delete file
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const id = String(req.params.id);

    const file = await prisma.cloudFile.findFirst({ where: { id, userId } });
    if (!file) return res.status(404).json({ error: 'File not found' });

    await prisma.cloudFile.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Cloud delete error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// POST /api/cloud/folder — create folder
router.post('/folder', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { name, parent } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Folder name required' });

    const folderPath = `${parent || '/'}${name.trim()}/`;

    // Create a placeholder file to represent the folder
    const folder = await prisma.cloudFile.create({
      data: {
        userId,
        name: name.trim(),
        url: '',
        mimeType: 'application/x-directory',
        size: 0,
        folder: parent || '/',
        isStarred: false,
      },
    });

    res.json(folder);
  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

export default router;
