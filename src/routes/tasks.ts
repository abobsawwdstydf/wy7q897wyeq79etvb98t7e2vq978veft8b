import { Router } from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';
import { getSocket } from '../socket';

const router = Router();

// Get all tasks for user
router.get('/', async (req: AuthRequest, res) => {
  try {
    const status = Array.isArray(req.query.status) ? req.query.status[0] : req.query.status;
    const chatId = Array.isArray(req.query.chatId) ? req.query.chatId[0] : req.query.chatId;
    const limit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const offset = Array.isArray(req.query.offset) ? req.query.offset[0] : req.query.offset;
    const take = Math.min(Math.max(1, parseInt(String(limit ?? '50'), 10) || 50), 200);
    const skip = Math.max(0, parseInt(String(offset ?? '0'), 10) || 0);

    const where: any = {
      OR: [
        { creatorId: req.userId! },
        { assigneeId: req.userId! },
      ],
    };

    if (status) where.status = status;
    if (chatId) where.chatId = chatId;

    const tasks = await prisma.task.findMany({
      where,
      include: {
        creator: { select: { id: true, username: true, displayName: true, avatar: true } },
        chat: { select: { id: true, name: true, type: true } },
      },
      orderBy: { deadline: 'asc' },
      take,
      skip,
    });

    const total = await prisma.task.count({ where });

    res.json({ tasks, total });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create task
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { chatId, title, description, priority, deadline, assigneeId } = req.body;

    if (!chatId || !title) {
      res.status(400).json({ error: 'chatId and title required' });
      return;
    }

    // Check if user is member of chat
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member) {
      res.status(403).json({ error: 'Not a member of this chat' });
      return;
    }

    const task = await prisma.task.create({
      data: {
        chatId,
        creatorId: req.userId!,
        title,
        description,
        priority: priority || 'medium',
        deadline: deadline ? new Date(deadline) : null,
        assigneeId,
      },
      include: {
        creator: { select: { id: true, username: true, displayName: true, avatar: true } },
        chat: { select: { id: true, name: true } },
      },
    });

    // Notify assignee
    if (assigneeId) {
      const io = getSocket();
      if (io) {
        io.to(assigneeId).emit('task_assigned', task);
      }
    }

    res.json(task);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update task
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const { title, description, priority, status, deadline, assigneeId, completionNote } = req.body;

    const task = await prisma.task.update({
      where: { id },
      data: {
        title,
        description,
        priority,
        status,
        deadline: deadline ? new Date(deadline) : null,
        assigneeId,
        completionNote,
        completedAt: status === 'completed' ? new Date() : null,
      },
      include: {
        creator: { select: { id: true, username: true, displayName: true, avatar: true } },
        chat: { select: { id: true, name: true } },
      },
    });

    // Notify assignee
    if (assigneeId) {
      const io = getSocket();
      if (io) {
        io.to(assigneeId).emit('task_updated', task);
      }
    }

    res.json(task);
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete task
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);

    await prisma.task.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
