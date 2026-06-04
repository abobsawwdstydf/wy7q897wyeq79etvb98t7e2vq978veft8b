import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import express from 'express';
import { prisma } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Configure multer for audio upload
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'profile-music');
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
    cb(null, `music-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only MP3, WAV, OGG, WebM, and M4A are allowed.'));
    }
  },
});

interface ProfileTrack {
  id: string;
  name: string;
  url: string;
  duration: number;
  uploadedAt: string;
}

// GET /api/profile-music/file/:filename - Get audio file (MUST BE BEFORE /:userId)
router.get('/file/:filename', async (req, res) => {
  try {
    const filename = String(req.params.filename);
    const filePath = path.join(process.cwd(), 'uploads', 'profile-music', filename);

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'Audio file not found' });
    }

    // Get file stats
    const stats = await fs.stat(filePath);

    // Support Range requests for streaming
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
        'Content-Type': 'audio/mpeg',
      });

      const stream = require('fs').createReadStream(filePath, { start, end });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stats.size,
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes',
      });

      const stream = require('fs').createReadStream(filePath);
      stream.pipe(res);
    }
  } catch (error) {
    console.error('Error serving audio file:', error);
    res.status(500).json({ error: 'Failed to serve audio file' });
  }
});

// GET /api/profile-music - Get current user's profile music
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { profileMusic: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    try {
      const tracks = JSON.parse(user.profileMusic || '[]') as ProfileTrack[];
      res.json(tracks);
    } catch {
      res.json([]);
    }
  } catch (error) {
    console.error('Error fetching profile music:', error);
    res.status(500).json({ error: 'Failed to fetch profile music' });
  }
});

// GET /api/profile-music/:userId - Get user's profile music
router.get('/:userId', async (req: AuthRequest, res) => {
  try {
    const userId = String(req.params.userId);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { profileMusic: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    try {
      const tracks = JSON.parse(user.profileMusic || '[]') as ProfileTrack[];
      res.json(tracks);
    } catch {
      res.json([]);
    }
  } catch (error) {
    console.error('Error fetching profile music:', error);
    res.status(500).json({ error: 'Failed to fetch profile music' });
  }
});

// POST /api/profile-music - Upload and add track to profile
router.post('/', authenticateToken, upload.single('audio') as any, async (req: AuthRequest, res: express.Response) => {
  try {
    const userId = req.userId!;
    const { duration } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    // Validate duration
    const durationNum = parseInt(duration, 10);
    if (isNaN(durationNum) || durationNum <= 0 || durationNum > 600) {
      await fs.unlink(file.path);
      return res.status(400).json({ error: 'Invalid duration. Maximum 10 minutes.' });
    }

    // Get current profile music
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { profileMusic: true },
    });

    let tracks: ProfileTrack[] = [];
    try {
      tracks = JSON.parse(user?.profileMusic || '[]');
    } catch {
      tracks = [];
    }

    // Create new track
    const newTrack: ProfileTrack = {
      id: `track-${Date.now()}`,
      name: Buffer.from(file.originalname, 'latin1').toString('utf8').replace(/\.[^/.]+$/, ''), // Remove extension, fix Cyrillic encoding
      url: `/api/profile-music/file/${file.filename}`,
      duration: durationNum,
      uploadedAt: new Date().toISOString(),
    };

    // Add to tracks (max 10 tracks)
    if (tracks.length >= 10) {
      await fs.unlink(file.path);
      return res.status(400).json({ error: 'Maximum 10 tracks allowed' });
    }

    tracks.push(newTrack);

    // Update user
    await prisma.user.update({
      where: { id: userId },
      data: { profileMusic: JSON.stringify(tracks) },
    });

    res.json(newTrack);
  } catch (error) {
    console.error('Error uploading profile music:', error);
    res.status(500).json({ error: 'Failed to upload music' });
  }
}, (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Multer error handler
  console.error('Multer error:', err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large (max 20MB)' });
  }
  res.status(400).json({ error: err.message || 'Upload failed' });
});

// DELETE /api/profile-music/:trackId - Remove track from profile
router.delete('/:trackId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const trackId = String(req.params.trackId);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { profileMusic: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let tracks: ProfileTrack[] = [];
    try {
      tracks = JSON.parse(user.profileMusic || '[]');
    } catch {
      tracks = [];
    }

    // Find and remove track
    const trackIndex = tracks.findIndex((t) => t.id === trackId);
    if (trackIndex === -1) {
      return res.status(404).json({ error: 'Track not found' });
    }

    const track = tracks[trackIndex];
    tracks.splice(trackIndex, 1);

    // Delete file
    try {
      const filename = track.url.split('/').pop();
      if (filename) {
        const filePath = path.join(process.cwd(), 'uploads', 'profile-music', filename);
        await fs.unlink(filePath).catch(() => {}); // Ignore if file doesn't exist
      }
    } catch (err) {
      console.error('Error deleting file:', err);
    }

    // Update user
    await prisma.user.update({
      where: { id: userId },
      data: { profileMusic: JSON.stringify(tracks) },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting profile music:', error);
    res.status(500).json({ error: 'Failed to delete music' });
  }
});

// PUT /api/profile-music/reorder - Reorder tracks
router.put('/reorder', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { trackIds } = req.body;

    if (!Array.isArray(trackIds)) {
      return res.status(400).json({ error: 'trackIds must be an array' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { profileMusic: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let tracks: ProfileTrack[] = [];
    try {
      tracks = JSON.parse(user.profileMusic || '[]');
    } catch {
      tracks = [];
    }

    // Reorder tracks
    const reorderedTracks: ProfileTrack[] = [];
    for (const trackId of trackIds) {
      const track = tracks.find((t) => t.id === trackId);
      if (track) {
        reorderedTracks.push(track);
      }
    }

    // Update user
    await prisma.user.update({
      where: { id: userId },
      data: { profileMusic: JSON.stringify(reorderedTracks) },
    });

    res.json(reorderedTracks);
  } catch (error) {
    console.error('Error reordering profile music:', error);
    res.status(500).json({ error: 'Failed to reorder music' });
  }
});

export default router;
