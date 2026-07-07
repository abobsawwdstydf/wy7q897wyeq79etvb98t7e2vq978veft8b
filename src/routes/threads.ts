import { Router } from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';
import { SENDER_SELECT, MESSAGE_INCLUDE } from '../shared';

const router = Router();

// Get threads for a chat
router.get('/chat/:chatId', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.chatId);
    
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });
    if (!member) {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }

    const threads = await prisma.thread.findMany({
      where: { chatId },
      include: {
        message: {
          include: {
            sender: { select: SENDER_SELECT },
            media: true,
          },
        },
        _count: {
          select: { messages: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json(threads.map(t => ({
      ...t,
      replyCount: t._count.messages,
      _count: undefined,
    })));
  } catch (error) {
    console.error('Get threads error:', error);
    res.status(500).json({ error: 'Ошибка' });
  }
});

// Create a thread from a message
router.post('/chat/:chatId/thread', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.chatId);
    const { messageId, title } = req.body;

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });
    if (!member) {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }

    const message = await prisma.message.findUnique({
      where: { id: String(messageId), chatId },
    });
    if (!message) {
      res.status(404).json({ error: 'Сообщение не найдено' });
      return;
    }

    // Check if thread already exists for this message
    const existingThread = await prisma.thread.findUnique({
      where: { messageId: String(messageId) },
    });
    if (existingThread) {
      res.json(existingThread);
      return;
    }

    const thread = await prisma.thread.create({
      data: {
        chatId,
        messageId: String(messageId),
        title: title || null,
      },
      include: {
        message: {
          include: {
            sender: { select: SENDER_SELECT },
            media: true,
          },
        },
      },
    });

    res.json(thread);
  } catch (error) {
    console.error('Create thread error:', error);
    res.status(500).json({ error: 'Ошибка' });
  }
});

// Get messages in a thread
router.get('/thread/:threadId/messages', async (req: AuthRequest, res) => {
  try {
    const threadId = String(req.params.threadId);

    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
      include: { chat: { include: { members: { where: { userId: req.userId! } } } } },
    });
    if (!thread || thread.chat.members.length === 0) {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }

    const messages = await prisma.message.findMany({
      where: { threadId, isDeleted: false },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });

    res.json(messages);
  } catch (error) {
    console.error('Get thread messages error:', error);
    res.status(500).json({ error: 'Ошибка' });
  }
});

// Delete a thread
router.delete('/thread/:threadId', async (req: AuthRequest, res) => {
  try {
    const threadId = String(req.params.threadId);

    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
      include: { chat: { include: { members: { where: { userId: req.userId! } } } } },
    });
    if (!thread || thread.chat.members.length === 0) {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }

    // Delete all messages in thread
    await prisma.message.deleteMany({ where: { threadId } });
    await prisma.thread.delete({ where: { id: threadId } });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete thread error:', error);
    res.status(500).json({ error: 'Ошибка' });
  }
});

export default router;
