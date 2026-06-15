import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { prisma } from '../db';
import { localStorage } from '../lib/localStorage';

const router = Router();

// Redirect old /uploads/files/ paths to new API
router.get('/uploads/files/:fileId', (req: Request, res: Response) => {
  const { fileId } = req.params;
  res.redirect(301, `/api/files/${fileId}/download`);
});

// Endpoint для скачивания файлов из локального хранилища
router.get('/files/:fileId/download', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;

    // CORS for media
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

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

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[FILES] Download error:', message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Ошибка скачивания: ' + message });
    }
  }
});

// Public endpoint for video notes file serving (no auth required)
router.get('/video-notes/file/:filename', async (req: Request, res: Response) => {
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
