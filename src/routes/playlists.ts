import { Router } from 'express';
import { prisma } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Get my playlists + playlists I'm a member of
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const [owned, member] = await Promise.all([
      prisma.collabPlaylist.findMany({
        where: { ownerId: userId },
        include: {
          members: true,
          _count: { select: { members: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.playlistMember.findMany({
        where: { userId, playlist: { ownerId: { not: userId } } },
        include: {
          playlist: {
            include: {
              members: true,
              _count: { select: { members: true } },
            },
          },
        },
      }),
    ]);

    const memberPlaylists = member.map(m => m.playlist);
    res.json({ playlists: [...owned, ...memberPlaylists] });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Get playlists for a chat
router.get('/chat/:chatId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { chatId } = req.params;
    const playlists = await prisma.collabPlaylist.findMany({
      where: { chatId },
      include: {
        members: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ playlists });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Get single playlist
router.get('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const playlist = await prisma.collabPlaylist.findUnique({
      where: { id },
      include: {
        members: true,
      },
    });
    if (!playlist) {
      res.status(404).json({ error: 'Плейлист не найден' });
      return;
    }
    res.json({ playlist });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Create playlist
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { name, description, chatId, isPublic, coverUrl } = req.body;

    if (!name?.trim()) {
      res.status(400).json({ error: 'Название обязательно' });
      return;
    }

    const playlist = await prisma.collabPlaylist.create({
      data: {
        name: name.trim().slice(0, 100),
        description: description?.trim().slice(0, 500),
        ownerId: userId,
        chatId: chatId || null,
        isPublic: !!isPublic,
        coverUrl: coverUrl || null,
      },
      include: { members: true },
    });

    // Add owner as member
    await prisma.playlistMember.create({
      data: { playlistId: playlist.id, userId, canEdit: true },
    });

    res.json({ playlist });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Update playlist
router.put('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    const { name, description, isPublic, coverUrl } = req.body;

    const playlist = await prisma.collabPlaylist.findUnique({ where: { id } });
    if (!playlist || playlist.ownerId !== userId) {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }

    const updated = await prisma.collabPlaylist.update({
      where: { id },
      data: {
        name: name?.trim().slice(0, 100),
        description: description?.trim().slice(0, 500),
        isPublic: isPublic !== undefined ? !!isPublic : undefined,
        coverUrl: coverUrl || null,
      },
      include: { members: true },
    });

    res.json({ playlist: updated });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Delete playlist
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    const playlist = await prisma.collabPlaylist.findUnique({ where: { id } });
    if (!playlist || playlist.ownerId !== userId) {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }

    await prisma.collabPlaylist.delete({ where: { id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Add track to playlist
router.post('/:id/tracks', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    const { title, artist, url, duration, coverUrl } = req.body;

    if (!title?.trim() || !url?.trim()) {
      res.status(400).json({ error: 'Название и URL обязательны' });
      return;
    }

    // Check membership
    const member = await prisma.playlistMember.findUnique({
      where: { playlistId_userId: { playlistId: id, userId } },
    });
    const playlist = await prisma.collabPlaylist.findUnique({ where: { id } });

    if (!playlist) {
      res.status(404).json({ error: 'Плейлист не найден' });
      return;
    }

    if (!member && playlist.ownerId !== userId) {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }

    if (member && !member.canEdit && playlist.ownerId !== userId) {
      res.status(403).json({ error: 'Нет прав на редактирование' });
      return;
    }

    // Get max order
    const maxOrder = await prisma.playlistTrack.aggregate({
      where: { playlistId: id },
      _max: { order: true },
    });

    const track = await prisma.playlistTrack.create({
      data: {
        playlistId: id,
        addedBy: userId,
        title: title.trim().slice(0, 200),
        artist: artist?.trim().slice(0, 100),
        url: url.trim(),
        duration: duration ? Number(duration) : null,
        coverUrl: coverUrl || null,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });

    // Update playlist updatedAt
    await prisma.collabPlaylist.update({ where: { id }, data: { updatedAt: new Date() } });

    res.json({ track });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Remove track from playlist
router.delete('/:id/tracks/:trackId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id, trackId } = req.params;
    const userId = req.userId!;

    const track = await prisma.playlistTrack.findUnique({ where: { id: trackId } });
    if (!track || track.playlistId !== id) {
      res.status(404).json({ error: 'Трек не найден' });
      return;
    }

    const playlist = await prisma.collabPlaylist.findUnique({ where: { id } });
    const member = await prisma.playlistMember.findUnique({
      where: { playlistId_userId: { playlistId: id, userId } },
    });

    // Can remove if: owner, or added the track, or has edit rights
    const canRemove = playlist?.ownerId === userId || track.addedBy === userId || (member?.canEdit ?? false);
    if (!canRemove) {
      res.status(403).json({ error: 'Нет прав' });
      return;
    }

    await prisma.playlistTrack.delete({ where: { id: trackId } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Reorder tracks
router.put('/:id/tracks/reorder', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    const { trackIds } = req.body; // ordered array of track IDs

    const playlist = await prisma.collabPlaylist.findUnique({ where: { id } });
    if (!playlist || playlist.ownerId !== userId) {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }

    await Promise.all(
      (trackIds as string[]).map((trackId, index) =>
        prisma.playlistTrack.update({ where: { id: trackId }, data: { order: index } })
      )
    );

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Add member to playlist
router.post('/:id/members', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    const { targetUserId, canEdit } = req.body;

    const playlist = await prisma.collabPlaylist.findUnique({ where: { id } });
    if (!playlist || playlist.ownerId !== userId) {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }

    const member = await prisma.playlistMember.upsert({
      where: { playlistId_userId: { playlistId: id, userId: targetUserId } },
      create: { playlistId: id, userId: targetUserId, canEdit: canEdit !== false },
      update: { canEdit: canEdit !== false },
    });

    res.json({ member });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Remove member from playlist
router.delete('/:id/members/:memberId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id, memberId } = req.params;
    const userId = req.userId!;

    const playlist = await prisma.collabPlaylist.findUnique({ where: { id } });
    if (!playlist || playlist.ownerId !== userId) {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }

    await prisma.playlistMember.deleteMany({
      where: { playlistId: id, userId: memberId },
    });

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
