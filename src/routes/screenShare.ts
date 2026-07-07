import { Router } from 'express';
import { prisma } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getIO } from '../socket';

const router = Router();

// Start screen sharing
router.post('/:roomId/screen-share', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { roomId } = req.params;
    const { streamUrl } = req.body;

    // Verify user is participant
    const participant = await prisma.voiceRoomParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (!participant) return res.status(403).json({ error: 'Not a room participant' });
    if (!participant.isSpeaker) return res.status(403).json({ error: 'Only speakers can share screen' });

    // Stop existing screen share
    await prisma.screenShare.updateMany({
      where: { roomId, userId, endedAt: null },
      data: { endedAt: new Date() },
    });

    const screenShare = await prisma.screenShare.create({
      data: { roomId, userId, streamUrl },
    });

    const io = getIO();
    io.to(`voice:${roomId}`).emit('voice:screen_share_started', {
      roomId,
      userId,
      screenShare,
    });

    res.json(screenShare);
  } catch (error) {
    console.error('Start screen share error:', error);
    res.status(500).json({ error: 'Failed to start screen share' });
  }
});

// Stop screen sharing
router.post('/:roomId/screen-share/stop', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { roomId } = req.params;

    const updated = await prisma.screenShare.updateMany({
      where: { roomId, userId, endedAt: null },
      data: { endedAt: new Date() },
    });

    if (updated.count === 0) return res.status(404).json({ error: 'No active screen share' });

    const io = getIO();
    io.to(`voice:${roomId}`).emit('voice:screen_share_stopped', { roomId, userId });

    res.json({ success: true });
  } catch (error) {
    console.error('Stop screen share error:', error);
    res.status(500).json({ error: 'Failed to stop screen share' });
  }
});

// Pause / resume screen share
router.post('/:roomId/screen-share/pause', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { roomId } = req.params;
    const { isPaused } = req.body;

    const share = await prisma.screenShare.findFirst({
      where: { roomId, userId, endedAt: null },
    });
    if (!share) return res.status(404).json({ error: 'No active screen share' });

    const updated = await prisma.screenShare.update({
      where: { id: share.id },
      data: { isPaused: isPaused !== false },
    });

    const io = getIO();
    io.to(`voice:${roomId}`).emit('voice:screen_share_paused', { roomId, userId, isPaused: updated.isPaused });

    res.json(updated);
  } catch (error) {
    console.error('Pause screen share error:', error);
    res.status(500).json({ error: 'Failed to pause screen share' });
  }
});

// Get active screen shares in a room
router.get('/:roomId/screen-shares', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { roomId } = req.params;
    const shares = await prisma.screenShare.findMany({
      where: { roomId, endedAt: null },
    });

    // Attach user info
    const userIds = [...new Set(shares.map(s => s.userId))];
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, username: true, displayName: true, avatar: true },
        })
      : [];
    const userMap = new Map(users.map(u => [u.id, u]));

    res.json(shares.map(s => ({ ...s, user: userMap.get(s.userId) || null })));
  } catch (error) {
    console.error('Get screen shares error:', error);
    res.status(500).json({ error: 'Failed to get screen shares' });
  }
});

export default router;
