import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { prisma } from '../db';
import { localStorage } from '../lib/localStorage';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Redirect old /uploads/files/ paths to new API
router.get('/uploads/files/:fileId', (req: Request, res: Response) => {
  const { fileId } = req.params;
  res.redirect(301, `/api/files/${fileId}/download`);
});

// Endpoint для скачивания файлов из локального хранилища
router.get('/files/:fileId/download', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { fileId } = req.params;

    if (!fileId) {
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
        res.status(404).json({ error: 'Файл не найден' });
        return;
      }

      if (!localFile.chunks || localFile.chunks.length === 0) {
        res.status(404).json({ error: 'Файл повреждён (нет чанков)' });
        return;
      }

      let fileBuffer: Buffer;
      try {
        fileBuffer = await localStorage.downloadFile(localFile.fileId, localFile.chunks);
      } catch {
        res.status(503).json({ error: 'Файл временно недоступен' });
        return;
      }

      await prisma.localFile.update({
        where: { fileId },
        data: { lastAccessed: new Date(), accessCount: { increment: 1 } }
      }).catch(() => {});

      const isInline = localFile.mimeType.startsWith('image/') ||
                       localFile.mimeType.startsWith('video/') ||
                       localFile.mimeType.startsWith('audio/');

      if (isInline) {
        // Check if user wants original format restored
        const originalFormat = req.query.format as string;
        let finalBuffer = fileBuffer;
        let finalMime = localFile.mimeType;

        // Restore original format if requested
        if (originalFormat && (
          (originalFormat === 'png' && localFile.mimeType === 'image/avif') ||
          (originalFormat === 'jpg' && localFile.mimeType === 'image/avif') ||
          (originalFormat === 'jpeg' && localFile.mimeType === 'image/avif') ||
          (originalFormat === 'gif' && localFile.mimeType === 'image/webp') ||
          (originalFormat === 'webp' && localFile.mimeType === 'image/avif')
        )) {
          try {
            if (originalFormat === 'gif' && localFile.mimeType === 'image/webp') {
              finalBuffer = await sharp(fileBuffer, { animated: true }).gif().toBuffer();
              finalMime = 'image/gif';
            } else if (originalFormat === 'png') {
              finalBuffer = await sharp(fileBuffer).png().toBuffer();
              finalMime = 'image/png';
            } else if (originalFormat === 'jpg' || originalFormat === 'jpeg') {
              finalBuffer = await sharp(fileBuffer).jpeg({ quality: 95 }).toBuffer();
              finalMime = 'image/jpeg';
            } else if (originalFormat === 'webp') {
              finalBuffer = await sharp(fileBuffer).webp({ quality: 90 }).toBuffer();
              finalMime = 'image/webp';
            }
          } catch {
            // Keep converted format if restore fails
            finalBuffer = fileBuffer;
            finalMime = localFile.mimeType;
          }
        }

        res.setHeader('Content-Type', finalMime);
        res.setHeader('Content-Length', finalBuffer.length);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

        const range = req.headers.range;
        if (range) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : finalBuffer.length - 1;

          if (start >= finalBuffer.length) {
            res.writeHead(416, { 'Content-Range': `bytes */${finalBuffer.length}` });
            res.end();
            return;
          }

          const chunk = finalBuffer.slice(start, Math.min(end + 1, finalBuffer.length));
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${Math.min(end, finalBuffer.length - 1)}/${finalBuffer.length}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunk.length,
            'Content-Type': finalMime,
          });
          res.end(chunk);
        } else {
          res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(localFile.originalName)}"`);
          res.end(finalBuffer);
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

  } catch (error: unknown) {
    console.error('[FILES] Download error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Ошибка скачивания файла' });
    }
  }
});

// SECURITY FIX: Video notes require authentication
router.get('/video-notes/file/:filename', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const filename = String(req.params.filename);

    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const filePath = path.join(process.cwd(), 'uploads', 'video-notes', filename);

    try {
      await fs.promises.access(filePath);
    } catch {
      return res.status(404).json({ error: 'Video note not found' });
    }

    const stats = await fs.promises.stat(filePath);

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

      const stream = fs.createReadStream(filePath, { start, end });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stats.size,
        'Content-Type': 'video/webm',
      });

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    }
  } catch (error) {
    console.error('Error serving video note:', error);
    res.status(500).json({ error: 'Failed to serve video note' });
  }
});

export default router;
