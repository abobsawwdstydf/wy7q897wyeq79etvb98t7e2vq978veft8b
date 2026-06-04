import { Router } from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';
import { getSocket } from '../socket';

const router = Router();

// Get calendar events
router.get('/', async (req: AuthRequest, res) => {
  try {
    const startDate = Array.isArray(req.query.startDate) ? req.query.startDate[0] : req.query.startDate;
    const endDate = Array.isArray(req.query.endDate) ? req.query.endDate[0] : req.query.endDate;
    const chatId = Array.isArray(req.query.chatId) ? req.query.chatId[0] : req.query.chatId;

    const where: any = {
      invites: {
        some: { userId: req.userId! },
      },
    };

    if (startDate && endDate) {
      where.startAt = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string),
      };
    }

    if (chatId) where.chatId = chatId;

    const events = await prisma.calendarEvent.findMany({
      where,
      include: {
        creator: { select: { id: true, username: true, displayName: true, avatar: true } },
        invites: {
          include: {
            user: { select: { id: true, username: true, displayName: true, avatar: true } },
          },
        },
      },
      orderBy: { startAt: 'asc' },
    });

    res.json(events);
  } catch (error) {
    console.error('Get calendar events error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create event
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { title, description, location, startAt, endAt, chatId, inviteeIds } = req.body;

    if (!title || !startAt) {
      res.status(400).json({ error: 'title and startAt required' });
      return;
    }

    if (chatId) {
      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId: req.userId! } },
      });

      if (!member) {
        res.status(403).json({ error: 'Not a member of this chat' });
        return;
      }
    }

    const event = await prisma.calendarEvent.create({
      data: {
        title,
        description,
        location,
        startAt: new Date(startAt),
        endAt: endAt ? new Date(endAt) : null,
        chatId,
        creatorId: req.userId!,
        invites: {
          create: (inviteeIds || []).map((userId: string) => ({
            userId,
            status: 'pending',
          })),
        },
      },
      include: {
        creator: { select: { id: true, username: true, displayName: true, avatar: true } },
        invites: {
          include: {
            user: { select: { id: true, username: true, displayName: true, avatar: true } },
          },
        },
      },
    });

    // Notify invitees
    const io = getSocket();
    if (io) {
      (inviteeIds || []).forEach((userId: string) => {
        io.to(userId).emit('calendar_invite', event);
      });
    }

    res.json(event);
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update event
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const { title, description, location, startAt, endAt } = req.body;

    const event = await prisma.calendarEvent.update({
      where: { id },
      data: {
        title,
        description,
        location,
        startAt: new Date(startAt),
        endAt: endAt ? new Date(endAt) : null,
      },
      include: {
        creator: { select: { id: true, username: true, displayName: true, avatar: true } },
        invites: {
          include: {
            user: { select: { id: true, username: true, displayName: true, avatar: true } },
          },
        },
      },
    });

    res.json(event);
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Respond to invite
router.post('/:eventId/respond', async (req: AuthRequest, res) => {
  try {
    const eventId = String(req.params.eventId);
    const { status } = req.body;

    if (!['accepted', 'declined', 'tentative'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    const invite = await prisma.calendarInvite.update({
      where: { eventId_userId: { eventId, userId: req.userId! } },
      data: { status },
      include: {
        event: {
          include: {
            creator: { select: { id: true, username: true, displayName: true, avatar: true } },
            invites: {
              include: {
                user: { select: { id: true, username: true, displayName: true, avatar: true } },
              },
            },
          },
        },
      },
    });

    res.json(invite);
  } catch (error) {
    console.error('Respond to invite error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete event
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);

    await prisma.calendarEvent.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
