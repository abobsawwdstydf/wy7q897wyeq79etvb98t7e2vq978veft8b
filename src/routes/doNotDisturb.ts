import { Router } from 'express';
import { prisma } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Get DND settings
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    let dnd = await prisma.doNotDisturb.findUnique({ where: { userId } });
    if (!dnd) {
      dnd = await prisma.doNotDisturb.create({ data: { userId } });
    }

    // Calculate if DND is currently active
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentDay = now.getDay(); // 0=Sun, 1=Mon...
    const weekdays = dnd.weekdays.split(',').map(Number);
    // Convert JS day (0=Sun) to ISO (1=Mon..7=Sun)
    const isoDay = currentDay === 0 ? 7 : currentDay;
    const isDayActive = weekdays.includes(isoDay);

    const currentTimeMinutes = currentHour * 60 + currentMinute;
    const startTimeMinutes = dnd.startHour * 60 + dnd.startMinute;
    const endTimeMinutes = dnd.endHour * 60 + dnd.endMinute;

    let isCurrentlyActive = false;
    if (dnd.isEnabled && isDayActive) {
      if (startTimeMinutes <= endTimeMinutes) {
        isCurrentlyActive = currentTimeMinutes >= startTimeMinutes && currentTimeMinutes < endTimeMinutes;
      } else {
        // Overnight schedule (e.g., 22:00 - 08:00)
        isCurrentlyActive = currentTimeMinutes >= startTimeMinutes || currentTimeMinutes < endTimeMinutes;
      }
    }

    res.json({ ...dnd, isCurrentlyActive });
  } catch (error) {
    console.error('Get DND error:', error);
    res.status(500).json({ error: 'Failed to get DND settings' });
  }
});

// Update DND settings
router.put('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { isEnabled, startHour, startMinute, endHour, endMinute, weekdays, allowCalls, allowFriends, customMessage } = req.body;

    const dnd = await prisma.doNotDisturb.upsert({
      where: { userId },
      create: {
        userId,
        isEnabled: isEnabled ?? false,
        startHour: startHour ?? 22,
        startMinute: startMinute ?? 0,
        endHour: endHour ?? 8,
        endMinute: endMinute ?? 0,
        weekdays: weekdays ?? '1,2,3,4,5,6,7',
        allowCalls: allowCalls ?? false,
        allowFriends: allowFriends ?? false,
        customMessage,
      },
      update: {
        ...(typeof isEnabled === 'boolean' && { isEnabled }),
        ...(typeof startHour === 'number' && { startHour }),
        ...(typeof startMinute === 'number' && { startMinute }),
        ...(typeof endHour === 'number' && { endHour }),
        ...(typeof endMinute === 'number' && { endMinute }),
        ...(typeof weekdays === 'string' && { weekdays }),
        ...(typeof allowCalls === 'boolean' && { allowCalls }),
        ...(typeof allowFriends === 'boolean' && { allowFriends }),
        ...(typeof customMessage === 'string' && { customMessage }),
      },
    });

    res.json(dnd);
  } catch (error) {
    console.error('Update DND error:', error);
    res.status(500).json({ error: 'Failed to update DND settings' });
  }
});

// Quick toggle DND on/off
router.post('/toggle', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { isEnabled } = req.body;

    let dnd = await prisma.doNotDisturb.findUnique({ where: { userId } });
    if (!dnd) {
      dnd = await prisma.doNotDisturb.create({ data: { userId, isEnabled: isEnabled !== false } });
    } else {
      dnd = await prisma.doNotDisturb.update({
        where: { userId },
        data: { isEnabled: isEnabled !== undefined ? isEnabled : !dnd.isEnabled },
      });
    }

    res.json(dnd);
  } catch (error) {
    console.error('Toggle DND error:', error);
    res.status(500).json({ error: 'Failed to toggle DND' });
  }
});

// Check if a user is in DND mode (used internally)
router.get('/check/:userId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;

    const dnd = await prisma.doNotDisturb.findUnique({ where: { userId } });
    if (!dnd || !dnd.isEnabled) return res.json({ isDnd: false });

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentDay = now.getDay();
    const weekdays = dnd.weekdays.split(',').map(Number);
    const isoDay = currentDay === 0 ? 7 : currentDay;
    const isDayActive = weekdays.includes(isoDay);

    const currentTimeMinutes = currentHour * 60 + currentMinute;
    const startTimeMinutes = dnd.startHour * 60 + dnd.startMinute;
    const endTimeMinutes = dnd.endHour * 60 + dnd.endMinute;

    let isDnd = false;
    if (isDayActive) {
      if (startTimeMinutes <= endTimeMinutes) {
        isDnd = currentTimeMinutes >= startTimeMinutes && currentTimeMinutes < endTimeMinutes;
      } else {
        isDnd = currentTimeMinutes >= startTimeMinutes || currentTimeMinutes < endTimeMinutes;
      }
    }

    res.json({ isDnd, allowCalls: dnd.allowCalls, allowFriends: dnd.allowFriends, customMessage: dnd.customMessage });
  } catch (error) {
    console.error('Check DND error:', error);
    res.status(500).json({ error: 'Failed to check DND' });
  }
});

export default router;
