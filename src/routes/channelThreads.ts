import { Router } from 'express';
import { prisma } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getIO } from '../socket';

const router = Router();

// Get threads in a channel
router.get('/channel/:channelId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { channelId } = req.params;
    const { pinned } = req.query;

    const where: any = { channelId };
    if (pinned === 'true') where.isPinned = true;

    const threads = await prisma.channelThread.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      include: {
        _count: { select: { messages: true } },
      },
    });

    // Attach creator info
    const creatorIds = [...new Set(threads.map(t => t.creatorId))];
    const creators = creatorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, username: true, displayName: true, avatar: true },
        })
      : [];
    const creatorMap = new Map(creators.map(c => [c.id, c]));

    res.json(threads.map(t => ({
      ...t,
      messageCount: t._count.messages,
      creator: creatorMap.get(t.creatorId) || null,
      _count: undefined,
    })));
  } catch (error) {
    console.error('Get channel threads error:', error);
    res.status(500).json({ error: 'Failed to get threads' });
  }
});

// Create a thread in a channel
router.post('/channel/:channelId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { channelId } = req.params;
    const { title } = req.body;

    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title required' });
    }

    // Verify user is member of channel
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: channelId, userId } },
    });
    if (!member) return res.status(403).json({ error: 'Not a channel member' });

    const thread = await prisma.channelThread.create({
      data: { channelId, creatorId: userId, title: title.trim() },
    });

    const io = getIO();
    io.to(`chat:${channelId}`).emit('thread:created', thread);

    res.json(thread);
  } catch (error) {
    console.error('Create thread error:', error);
    res.status(500).json({ error: 'Failed to create thread' });
  }
});

// Get thread messages
router.get('/:threadId/messages', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { threadId } = req.params;
    const { limit = '50', offset = '0' } = req.query;

    const thread = await prisma.channelThread.findUnique({ where: { id: threadId } });
    if (!thread) return res.status(404).json({ error: 'Thread not found' });

    const messages = await prisma.channelThreadMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
      take: Math.min(Number(limit), 100),
      skip: Number(offset),
    });

    // Attach sender info
    const senderIds = [...new Set(messages.map(m => m.senderId))];
    const senders = senderIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: senderIds } },
          select: { id: true, username: true, displayName: true, avatar: true },
        })
      : [];
    const senderMap = new Map(senders.map(s => [s.id, s]));

    res.json(messages.map(m => ({
      ...m,
      sender: senderMap.get(m.senderId) || null,
    })));
  } catch (error) {
    console.error('Get thread messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Send message to thread
router.post('/:threadId/messages', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { threadId } = req.params;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Content required' });
    }

    const thread = await prisma.channelThread.findUnique({ where: { id: threadId } });
    if (!thread) return res.status(404).json({ error: 'Thread not found' });
    if (thread.isLocked) return res.status(403).json({ error: 'Thread is locked' });

    // Verify membership
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: thread.channelId, userId } },
    });
    if (!member) return res.status(403).json({ error: 'Not a channel member' });

    const message = await prisma.channelThreadMessage.create({
      data: { threadId, senderId: userId, content: content.trim() },
    });

    await prisma.channelThread.update({
      where: { id: threadId },
      data: { messageCount: { increment: 1 }, lastMessageAt: new Date() },
    });

    const sender = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, displayName: true, avatar: true },
    });

    const io = getIO();
    io.to(`chat:${thread.channelId}`).emit('thread:message', { ...message, sender });

    res.json({ ...message, sender });
  } catch (error) {
    console.error('Send thread message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Pin/unpin thread (channel admin only)
router.post('/:threadId/pin', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { threadId } = req.params;
    const { isPinned } = req.body;

    const thread = await prisma.channelThread.findUnique({ where: { id: threadId } });
    if (!thread) return res.status(404).json({ error: 'Thread not found' });

    // Check admin
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: thread.channelId, userId } },
      select: { role: true },
    });
    if (!member || (member.role !== 'admin' && member.role !== 'owner')) {
      return res.status(403).json({ error: 'Admin only' });
    }

    const updated = await prisma.channelThread.update({
      where: { id: threadId },
      data: { isPinned: isPinned !== false },
    });

    res.json(updated);
  } catch (error) {
    console.error('Pin thread error:', error);
    res.status(500).json({ error: 'Failed to pin thread' });
  }
});

// Lock/unlock thread (channel admin only)
router.post('/:threadId/lock', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { threadId } = req.params;
    const { isLocked } = req.body;

    const thread = await prisma.channelThread.findUnique({ where: { id: threadId } });
    if (!thread) return res.status(404).json({ error: 'Thread not found' });

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: thread.channelId, userId } },
      select: { role: true },
    });
    if (!member || (member.role !== 'admin' && member.role !== 'owner')) {
      return res.status(403).json({ error: 'Admin only' });
    }

    const updated = await prisma.channelThread.update({
      where: { id: threadId },
      data: { isLocked: isLocked !== false },
    });

    res.json(updated);
  } catch (error) {
    console.error('Lock thread error:', error);
    res.status(500).json({ error: 'Failed to lock thread' });
  }
});

// Delete thread (creator or admin)
router.delete('/:threadId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { threadId } = req.params;

    const thread = await prisma.channelThread.findUnique({ where: { id: threadId } });
    if (!thread) return res.status(404).json({ error: 'Thread not found' });

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: thread.channelId, userId } },
      select: { role: true },
    });

    if (thread.creatorId !== userId && member?.role !== 'admin' && member?.role !== 'owner') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await prisma.channelThread.delete({ where: { id: threadId } });

    const io = getIO();
    io.to(`chat:${thread.channelId}`).emit('thread:deleted', { threadId });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete thread error:', error);
    res.status(500).json({ error: 'Failed to delete thread' });
  }
});

export default router;
