import { Router } from 'express';
import { prisma } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Send private media (one-time view)
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const senderId = req.userId!;
    const { chatId, mediaUrl, mediaType, viewLimit = 1, isScreenshotBlocked = true, durationMinutes } = req.body;

    if (!chatId || !mediaUrl || !mediaType) {
      return res.status(400).json({ error: 'chatId, mediaUrl, mediaType required' });
    }

    // Verify membership
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: senderId } },
    });
    if (!member) return res.status(403).json({ error: 'Not a chat member' });

    // Create the message first
    const message = await prisma.message.create({
      data: {
        chatId,
        senderId,
        type: 'private_media',
        content: '🔒 Приватное медиа',
      },
    });

    // Create private media record
    const privateMedia = await prisma.privateMedia.create({
      data: {
        messageId: message.id,
        chatId,
        senderId,
        mediaUrl,
        mediaType,
        viewLimit: Math.min(Math.max(viewLimit, 1), 10),
        isScreenshotBlocked,
        expiresAt: durationMinutes ? new Date(Date.now() + durationMinutes * 60 * 1000) : null,
      },
    });

    res.json({ message: { ...message, privateMedia } });
  } catch (error) {
    console.error('Send private media error:', error);
    res.status(500).json({ error: 'Failed to send private media' });
  }
});

// View private media
router.post('/:messageId/view', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { messageId } = req.params;

    const privateMedia = await prisma.privateMedia.findUnique({
      where: { messageId },
      include: { viewers: true },
    });

    if (!privateMedia) return res.status(404).json({ error: 'Private media not found' });

    // Check expiry
    if (privateMedia.expiresAt && privateMedia.expiresAt < new Date()) {
      return res.status(410).json({ error: 'Media has expired' });
    }

    // Check view limit
    if (privateMedia.viewCount >= privateMedia.viewLimit) {
      return res.status(410).json({ error: 'View limit reached' });
    }

    // Verify user is chat member
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: privateMedia.chatId, userId } },
    });
    if (!member) return res.status(403).json({ error: 'Not a chat member' });

    // Record view
    const alreadyViewed = privateMedia.viewers.some(v => v.userId === userId);
    if (!alreadyViewed) {
      await prisma.privateMedia.update({
        where: { id: privateMedia.id },
        data: { viewCount: { increment: 1 } },
      });
    }

    res.json({
      mediaUrl: privateMedia.mediaUrl,
      mediaType: privateMedia.mediaType,
      isScreenshotBlocked: privateMedia.isScreenshotBlocked,
      remainingViews: privateMedia.viewLimit - privateMedia.viewCount - (alreadyViewed ? 0 : 1),
    });
  } catch (error) {
    console.error('View private media error:', error);
    res.status(500).json({ error: 'Failed to view media' });
  }
});

// Get private media info (without viewing)
router.get('/:messageId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { messageId } = req.params;

    const privateMedia = await prisma.privateMedia.findUnique({
      where: { messageId },
      include: { viewers: true },
    });

    if (!privateMedia) return res.status(404).json({ error: 'Private media not found' });

    const hasViewed = privateMedia.viewers.some(v => v.userId === userId);

    res.json({
      id: privateMedia.id,
      mediaType: privateMedia.mediaType,
      viewLimit: privateMedia.viewLimit,
      viewCount: privateMedia.viewCount,
      hasViewed,
      isScreenshotBlocked: privateMedia.isScreenshotBlocked,
      expiresAt: privateMedia.expiresAt,
      senderId: privateMedia.senderId,
    });
  } catch (error) {
    console.error('Get private media error:', error);
    res.status(500).json({ error: 'Failed to get media info' });
  }
});

export default router;
