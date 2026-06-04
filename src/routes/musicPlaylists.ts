import { Router } from 'express';
import { prisma } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';

const router = Router();

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'music-playlists');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Только изображения'));
    }
  }
});

router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const playlists = user?.musicPlaylists ? JSON.parse(user.musicPlaylists) : [];
    res.json(playlists);
  } catch (error) {
    console.error('Error fetching playlists:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/', authenticateToken, upload.single('cover'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { name } = req.body;
    const files = req.files as any;
    const cover = req.file;

    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Название обязательно' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const playlists = user?.musicPlaylists ? JSON.parse(user.musicPlaylists) : [];

    const newPlaylist = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2),
      name: name.trim(),
      coverUrl: cover ? `/uploads/music-playlists/${cover.filename}` : null,
      createdAt: new Date().toISOString(),
      tracks: [],
    };

    playlists.unshift(newPlaylist);

    await prisma.user.update({
      where: { id: userId },
      data: { musicPlaylists: JSON.stringify(playlists) },
    });

    res.json(newPlaylist);
  } catch (error) {
    console.error('Error creating playlist:', error);
    res.status(500).json({ error: 'Ошибка создания плейлиста' });
  }
});

router.put('/:id', authenticateToken, upload.single('cover'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { name } = req.body;
    const cover = req.file;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const playlists = user?.musicPlaylists ? JSON.parse(user.musicPlaylists) : [];
    const playlistIdx = playlists.findIndex((p: any) => p.id === id);

    if (playlistIdx === -1) {
      res.status(404).json({ error: 'Плейлист не найден' });
      return;
    }

    if (name) playlists[playlistIdx].name = name.trim();
    if (cover) playlists[playlistIdx].coverUrl = `/uploads/music-playlists/${cover.filename}`;

    await prisma.user.update({
      where: { id: userId },
      data: { musicPlaylists: JSON.stringify(playlists) },
    });

    res.json(playlists[playlistIdx]);
  } catch (error) {
    console.error('Error updating playlist:', error);
    res.status(500).json({ error: 'Ошибка обновления плейлиста' });
  }
});

router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const playlists = user?.musicPlaylists ? JSON.parse(user.musicPlaylists) : [];
    const filtered = playlists.filter((p: any) => p.id !== id);

    await prisma.user.update({
      where: { id: userId },
      data: { musicPlaylists: JSON.stringify(filtered) },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting playlist:', error);
    res.status(500).json({ error: 'Ошибка удаления плейлиста' });
  }
});

router.post('/:id/tracks', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { url, filename, duration } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const playlists = user?.musicPlaylists ? JSON.parse(user.musicPlaylists) : [];
    const playlist = playlists.find((p: any) => p.id === id);

    if (!playlist) {
      res.status(404).json({ error: 'Плейлист не найден' });
      return;
    }

    const track = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2),
      url,
      filename,
      duration: duration || 0,
      volume: 1,
      order: playlist.tracks.length,
    };

    playlist.tracks.push(track);

    await prisma.user.update({
      where: { id: userId },
      data: { musicPlaylists: JSON.stringify(playlists) },
    });

    res.json(track);
  } catch (error) {
    console.error('Error adding track:', error);
    res.status(500).json({ error: 'Ошибка добавления трека' });
  }
});

router.delete('/:playlistId/tracks/:trackId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { playlistId, trackId } = req.params;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const playlists = user?.musicPlaylists ? JSON.parse(user.musicPlaylists) : [];
    const playlist = playlists.find((p: any) => p.id === playlistId);

    if (!playlist) {
      res.status(404).json({ error: 'Плейлист не найден' });
      return;
    }

    playlist.tracks = playlist.tracks.filter((t: any) => t.id !== trackId);

    await prisma.user.update({
      where: { id: userId },
      data: { musicPlaylists: JSON.stringify(playlists) },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error removing track:', error);
    res.status(500).json({ error: 'Ошибка удаления трека' });
  }
});

export default router;

// ─── Standalone Tracks (without album/playlist) ───────────────────────

const audioStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'music-tracks');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const audioUpload = multer({
  storage: audioStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Только аудио файлы'));
    }
  }
});

// Get standalone tracks
router.get('/tracks', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const tracks = user?.musicTracks ? JSON.parse(user.musicTracks) : [];
    res.json(tracks);
  } catch (error) {
    console.error('Error fetching tracks:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Upload standalone track (no album required)
router.post('/tracks', authenticateToken, audioUpload.single('audio'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { title, artist, duration, albumId } = req.body;
    const audioFile = req.file;

    if (!audioFile) {
      res.status(400).json({ error: 'Аудио файл обязателен' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const tracks = user?.musicTracks ? JSON.parse(user.musicTracks) : [];

    const newTrack = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2),
      url: `/uploads/music-tracks/${audioFile.filename}`,
      filename: audioFile.originalname,
      title: title || audioFile.originalname.replace(/\.[^.]+$/, ''),
      artist: artist || 'Неизвестный исполнитель',
      duration: parseInt(duration) || 0,
      albumId: albumId || null,
      createdAt: new Date().toISOString(),
    };

    tracks.unshift(newTrack);

    await prisma.user.update({
      where: { id: userId },
      data: { musicTracks: JSON.stringify(tracks) },
    });

    res.json(newTrack);
  } catch (error) {
    console.error('Error uploading track:', error);
    res.status(500).json({ error: 'Ошибка загрузки трека' });
  }
});

// Delete standalone track
router.delete('/tracks/:trackId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { trackId } = req.params;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const tracks = user?.musicTracks ? JSON.parse(user.musicTracks) : [];
    const filtered = tracks.filter((t: any) => t.id !== trackId);

    await prisma.user.update({
      where: { id: userId },
      data: { musicTracks: JSON.stringify(filtered) },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting track:', error);
    res.status(500).json({ error: 'Ошибка удаления трека' });
  }
});
