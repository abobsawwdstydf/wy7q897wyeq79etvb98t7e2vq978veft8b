import { Router } from 'express';
import { prisma } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getIO } from '../socket';

const router = Router();

// Start sharing live location
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { chatId, latitude, longitude, accuracy, address, durationMinutes = 60 } = req.body;

    if (!chatId || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'chatId, latitude, longitude required' });
    }

    // Verify user is member of chat
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!member) return res.status(403).json({ error: 'Not a chat member' });

    // Deactivate previous active locations in this chat
    await prisma.liveLocation.updateMany({
      where: { chatId, userId, isActive: true },
      data: { isActive: false },
    });

    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);

    const location = await prisma.liveLocation.create({
      data: { chatId, userId, latitude, longitude, accuracy, address, expiresAt },
    });

    // Notify chat via socket
    const io = getIO();
    io.to(`chat:${chatId}`).emit('location:shared', { ...location, userId });

    res.json(location);
  } catch (error) {
    console.error('Share location error:', error);
    res.status(500).json({ error: 'Failed to share location' });
  }
});

// Update live location
router.put('/:locationId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { locationId } = req.params;
    const { latitude, longitude, accuracy, address } = req.body;

    const location = await prisma.liveLocation.findUnique({ where: { id: locationId } });
    if (!location) return res.status(404).json({ error: 'Location not found' });
    if (location.userId !== userId) return res.status(403).json({ error: 'Not your location' });
    if (!location.isActive || location.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Location sharing has ended' });
    }

    const updated = await prisma.liveLocation.update({
      where: { id: locationId },
      data: { latitude, longitude, accuracy, address },
    });

    const io = getIO();
    io.to(`chat:${location.chatId}`).emit('location:updated', { ...updated, userId });

    res.json(updated);
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// Stop sharing live location
router.delete('/:locationId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { locationId } = req.params;

    const location = await prisma.liveLocation.findUnique({ where: { id: locationId } });
    if (!location) return res.status(404).json({ error: 'Location not found' });
    if (location.userId !== userId) return res.status(403).json({ error: 'Not your location' });

    const updated = await prisma.liveLocation.update({
      where: { id: locationId },
      data: { isActive: false },
    });

    const io = getIO();
    io.to(`chat:${location.chatId}`).emit('location:stopped', { locationId, userId });

    res.json({ success: true });
  } catch (error) {
    console.error('Stop location error:', error);
    res.status(500).json({ error: 'Failed to stop location' });
  }
});

// Get active live locations in a chat
router.get('/chat/:chatId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { chatId } = req.params;

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!member) return res.status(403).json({ error: 'Not a chat member' });

    const locations = await prisma.liveLocation.findMany({
      where: { chatId, isActive: true, expiresAt: { gt: new Date() } },
    });

    // Attach user info
    const userIds = [...new Set(locations.map(l => l.userId))];
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, username: true, displayName: true, avatar: true },
        })
      : [];
    const userMap = new Map(users.map(u => [u.id, u]));

    res.json(locations.map(l => ({ ...l, user: userMap.get(l.userId) || null })));
  } catch (error) {
    console.error('Get locations error:', error);
    res.status(500).json({ error: 'Failed to get locations' });
  }
});

// Cleanup expired locations
async function cleanupExpiredLocations() {
  try {
    await prisma.liveLocation.updateMany({
      where: { isActive: true, expiresAt: { lte: new Date() } },
      data: { isActive: false },
    });
  } catch {}
}
cleanupExpiredLocations();
setInterval(cleanupExpiredLocations, 60 * 1000);

export default router;
