import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import express from 'express';
import { prisma } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Configure multer for video upload
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'video-notes');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error as Error, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `video-note-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['video/webm', 'video/mp4', 'video/quicktime'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only WebM and MP4 are allowed.'));
    }
  },
});

// GET /api/video-notes/file/:filename - Get video note file (PUBLIC - no auth)
router.get('/file/:filename', async (req, res) => {
  try {
    const filename = String(req.params.filename);
    
    // Validate filename to prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
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

// POST /api/video-notes - Upload video note (requires auth)
router.post('/', authenticateToken, upload.single('video') as any, async (req: AuthRequest, res: express.Response) => {
  try {
    const userId = (req as AuthRequest).userId!;
    const { chatId, duration } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    if (!chatId) {
      return res.status(400).json({ error: 'Chat ID is required' });
    }

    // Validate duration
    const durationNum = parseInt(duration, 10);
    if (isNaN(durationNum) || durationNum > 90) {
      // Delete uploaded file
      await fs.unlink(file.path);
      return res.status(400).json({ error: 'Invalid duration. Maximum 90 seconds.' });
    }

    // Check if user is member of chat
    const chatMember = await prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
    });

    if (!chatMember) {
      await fs.unlink(file.path);
      return res.status(403).json({ error: 'You are not a member of this chat' });
    }

    // Generate video URL
    const videoUrl = `/api/video-notes/file/${file.filename}`;

    // Fallback thumbnail so clients always receive a preview field.
    const thumbnail = '/beaver-coin.png';

    // Create message
    const message = await prisma.message.create({
      data: {
        chatId,
        senderId: userId,
        type: 'video_note',
        videoUrl,
        duration: durationNum,
        thumbnail,
      },
      include: {
        sender: {
          select: {
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
          },
        },
        readBy: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    // Broadcast via WebSocket (if socket.io is available)
    const io = (req as any).app.get('io');
    if (io) {
      io.to(chatId).emit('new_message', message);
    }

    res.json(message);
  } catch (error) {
    console.error('Error uploading video note:', error);
    res.status(500).json({ error: 'Failed to upload video note' });
  }
}, (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Multer error handler
  console.error('Multer error:', err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large (max 10MB)' });
  }
  res.status(400).json({ error: err.message || 'Upload failed' });
});

export default router;
