import { Router } from 'express';
import { prisma } from '../db';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Настройка multer для загрузки аудио
const uploadDir = path.join(process.cwd(), 'uploads', 'music-tracks');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/mp3', 'audio/x-wav', 'audio/x-flac'];
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(mp3|wav|ogg|flac|m4a)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Неподдерживаемый формат аудио'));
    }
  }
});

// Создать плейлист
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { chatId, title, description, coverUrl, isPublic } = req.body;

    if (!chatId || !title) {
      return res.status(400).json({ error: 'chatId и title обязательны' });
    }

    const playlist = await prisma.collaborativePlaylist.create({
      data: {
        chatId,
        creatorId: userId,
        title,
        description,
        coverUrl,
        isPublic: isPublic !== false
      }
    });

    res.json(playlist);
  } catch (error: any) {
    console.error('Error creating playlist:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить плейлисты чата
router.get('/chat/:chatId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { chatId } = req.params;

    const playlists = await prisma.collaborativePlaylist.findMany({
      where: { chatId },
      include: {
        tracks: {
          orderBy: { order: 'asc' }
        },
        _count: {
          select: { tracks: true }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    res.json(playlists);
  } catch (error: any) {
    console.error('Error fetching playlists:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить плейлист
router.get('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const playlist = await prisma.collaborativePlaylist.findUnique({
      where: { id },
      include: {
        tracks: {
          orderBy: { order: 'asc' }
        }
      }
    });

    if (!playlist) {
      return res.status(404).json({ error: 'Плейлист не найден' });
    }

    // Подсчитываем голоса для каждого трека
    const tracksWithVotes = await Promise.all(playlist.tracks.map(async (track) => {
      const votes = await prisma.playlistVote.aggregate({
        where: { trackId: track.id },
        _sum: { vote: true }
      });

      return {
        ...track,
        voteScore: votes._sum.vote || 0
      };
    }));

    res.json({
      ...playlist,
      tracks: tracksWithVotes
    });
  } catch (error: any) {
    console.error('Error fetching playlist:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить плейлист по chatId (для совместного плейлиста в чате)
router.get('/:chatId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.userId!;

    // Находим или создаем плейлист для чата
    let playlist = await prisma.collaborativePlaylist.findFirst({
      where: { chatId },
      include: {
        tracks: {
          orderBy: { order: 'asc' }
        }
      }
    });

    if (!playlist) {
      playlist = await prisma.collaborativePlaylist.create({
        data: {
          chatId,
          creatorId: userId,
          title: 'Совместный плейлист',
          isPublic: true
        },
        include: {
          tracks: {
            orderBy: { order: 'asc' }
          }
        }
      });
    }

    // Получаем инфу о пользователях, добавивших треки
    const addedByIds = [...new Set(playlist.tracks.map((t: any) => t.addedBy).filter(Boolean))];
    const addedByUsers = addedByIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: addedByIds as string[] } },
          select: { id: true, username: true, displayName: true }
        })
      : [];
    const userMap = new Map(addedByUsers.map(u => [u.id, u]));

    // Подсчитываем голоса для каждого трека
    const tracksWithVotes = await Promise.all(playlist.tracks.map(async (track: any) => {
      const votes = await prisma.playlistVote.aggregate({
        where: { trackId: track.id },
        _sum: { vote: true }
      });

      const userVote = await prisma.playlistVote.findUnique({
        where: {
          trackId_userId: {
            trackId: track.id,
            userId
          }
        }
      });

      return {
        id: track.id,
        title: track.title,
        artist: track.artist || '',
        url: track.url,
        duration: track.duration || 0,
        addedBy: userMap.get(track.addedBy) || null,
        votes: votes._sum.vote || 0,
        userVote: (userVote?.vote ?? 0) > 0 ? 'up' : (userVote?.vote ?? 0) < 0 ? 'down' : null
      };
    }));

    res.json({
      id: playlist.id,
      chatId: playlist.chatId,
      name: playlist.title,
      tracks: tracksWithVotes,
      isPlaying: false,
      currentTrackIndex: 0,
      listeners: [userId]
    });
  } catch (error: any) {
    console.error('Error fetching playlist:', error);
    res.status(500).json({ error: error.message });
  }
});

// Добавить трек по chatId
router.post('/:chatId/tracks', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { chatId } = req.params;
    const { url, title, artist, duration } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'url обязателен' });
    }

    // Находим плейлист
    let playlist = await prisma.collaborativePlaylist.findFirst({
      where: { chatId }
    });

    if (!playlist) {
      playlist = await prisma.collaborativePlaylist.create({
        data: {
          chatId,
          creatorId: userId,
          title: 'Совместный плейлист',
          isPublic: true
        }
      });
    }

    // Получаем максимальный order
    const maxOrder = await prisma.playlistTrack.aggregate({
      where: { playlistId: playlist.id },
      _max: { order: true }
    });

    const track = await prisma.playlistTrack.create({
      data: {
        playlistId: playlist.id,
        addedBy: userId,
        title: title || 'Без названия',
        artist: artist || '',
        url,
        duration: duration || 0,
        order: (maxOrder._max.order || 0) + 1
      }
    });

    // Получаем инфу о пользователе
    const addedByUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, displayName: true }
    });

    res.json({
      id: track.id,
      title: track.title,
      artist: track.artist,
      url: track.url,
      duration: track.duration || 0,
      addedBy: addedByUser,
      votes: 0,
      userVote: null
    });
  } catch (error: any) {
    console.error('Error adding track:', error);
    res.status(500).json({ error: error.message });
  }
});

// Загрузить аудиофайл и добавить трек
router.post('/:chatId/tracks/upload', authenticateToken, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { chatId } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    // Находим плейлист
    let playlist = await prisma.collaborativePlaylist.findFirst({
      where: { chatId }
    });

    if (!playlist) {
      playlist = await prisma.collaborativePlaylist.create({
        data: {
          chatId,
          creatorId: userId,
          title: 'Совместный плейлист',
          isPublic: true
        }
      });
    }

    // Получаем максимальный order
    const maxOrder = await prisma.playlistTrack.aggregate({
      where: { playlistId: playlist.id },
      _max: { order: true }
    });

    const fileUrl = `/uploads/music-tracks/${req.file.filename}`;
    const fileName = path.parse(req.file.originalname).name;

    const track = await prisma.playlistTrack.create({
      data: {
        playlistId: playlist.id,
        addedBy: userId,
        title: fileName,
        artist: '',
        url: fileUrl,
        duration: 0,
        order: (maxOrder._max.order || 0) + 1
      }
    });

    const addedByUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, displayName: true }
    });

    res.json({
      id: track.id,
      title: track.title,
      artist: track.artist,
      url: track.url,
      duration: track.duration || 0,
      addedBy: addedByUser,
      votes: 0,
      userVote: null
    });
  } catch (error: any) {
    console.error('Error uploading track:', error);
    res.status(500).json({ error: error.message });
  }
});

// Голосовать за трек
router.post('/:chatId/tracks/:trackId/vote', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { trackId } = req.params;
    const { vote } = req.body; // 1 или -1

    if (vote !== 1 && vote !== -1) {
      return res.status(400).json({ error: 'vote должен быть 1 или -1' });
    }

    const track = await prisma.playlistTrack.findUnique({
      where: { id: trackId }
    });

    if (!track) {
      return res.status(404).json({ error: 'Трек не найден' });
    }

    // Upsert голос
    await prisma.playlistVote.upsert({
      where: {
        trackId_userId: {
          trackId,
          userId
        }
      },
      create: {
        playlistId: track.playlistId,
        trackId,
        userId,
        vote
      },
      update: {
        vote
      }
    });

    // Подсчитываем общий счёт
    const votes = await prisma.playlistVote.aggregate({
      where: { trackId },
      _sum: { vote: true }
    });

    res.json({ voteScore: votes._sum.vote || 0 });
  } catch (error: any) {
    console.error('Error voting:', error);
    res.status(500).json({ error: error.message });
  }
});

// Удалить трек
router.delete('/:chatId/tracks/:trackId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { trackId } = req.params;

    const track = await prisma.playlistTrack.findUnique({
      where: { id: trackId },
      include: {
        playlist: true
      }
    });

    if (!track) {
      return res.status(404).json({ error: 'Трек не найден' });
    }

    // Проверяем права (создатель плейлиста или добавивший трек)
    if (track.addedBy !== userId && track.playlist.creatorId !== userId) {
      return res.status(403).json({ error: 'Нет прав' });
    }

    await prisma.playlistTrack.delete({
      where: { id: trackId }
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting track:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
