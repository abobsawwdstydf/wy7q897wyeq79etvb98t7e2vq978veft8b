import { Router } from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';
import { MESSAGE_INCLUDE } from '../shared';

const router = Router();

// Get all bookmarks
router.get('/', async (req: AuthRequest, res) => {
  try {
    const search = Array.isArray(req.query.search) ? req.query.search[0] : req.query.search;
    const chatId = Array.isArray(req.query.chatId) ? req.query.chatId[0] : req.query.chatId;
    const limit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const offset = Array.isArray(req.query.offset) ? req.query.offset[0] : req.query.offset;
    const take = Math.min(Math.max(1, parseInt(String(limit ?? '50'), 10) || 50), 200);
    const skip = Math.max(0, parseInt(String(offset ?? '0'), 10) || 0);

    const where: any = { userId: req.userId! };
    if (chatId) where.message = { chatId };
    if (search) where.message = { ...where.message, content: { contains: search } };

    const bookmarks = await prisma.bookmark.findMany({
      where,
      include: {
        message: {
          include: MESSAGE_INCLUDE,
        },
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });

    const total = await prisma.bookmark.count({ where });

    res.json({ bookmarks, total });
  } catch (error) {
    console.error('Get bookmarks error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add bookmark
router.post('/:messageId', async (req: AuthRequest, res) => {
  try {
    const messageId = String(req.params.messageId);
    const { note } = req.body;

    // Check if message exists
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: { chat: { include: { members: true } } },
    });

    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    // Check if user is member of chat
    const isMember = message.chat.members.some((m: { userId: string }) => m.userId === req.userId);
    if (!isMember) {
      res.status(403).json({ error: 'Not a member of this chat' });
      return;
    }

    // Create or update bookmark
    const bookmark = await prisma.bookmark.upsert({
      where: { userId_messageId: { userId: req.userId!, messageId } },
      update: { note },
      create: { userId: req.userId!, messageId, note },
      include: { message: { include: MESSAGE_INCLUDE } },
    });

    res.json(bookmark);
  } catch (error) {
    console.error('Add bookmark error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove bookmark
router.delete('/:messageId', async (req: AuthRequest, res) => {
  try {
    const messageId = String(req.params.messageId);

    await prisma.bookmark.delete({
      where: { userId_messageId: { userId: req.userId!, messageId } },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Remove bookmark error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
