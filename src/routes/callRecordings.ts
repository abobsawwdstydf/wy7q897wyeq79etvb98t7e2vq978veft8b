import express from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();

// Создать запись звонка
router.post('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { callId, chatId, type = 'audio' } = req.body;

    if (!callId || !chatId) {
      return res.status(400).json({ error: 'callId and chatId required' });
    }

    const recording = await prisma.callRecording.create({
      data: {
        callId,
        chatId,
        recorderId: userId,
        type,
        status: 'recording',
        fileUrl: '',
      },
    });

    res.json(recording);
  } catch (error) {
    console.error('Create call recording error:', error);
    res.status(500).json({ error: 'Failed to create recording' });
  }
});

// Обновить запись звонка
router.put('/:recordingId', async (req: AuthRequest, res) => {
  try {
    const { recordingId } = req.params;
    const { status, fileUrl, fileSize, duration } = req.body;

    const recording = await prisma.callRecording.findUnique({
      where: { id: recordingId },
    });

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    if (recording.recorderId !== req.userId!) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const updated = await prisma.callRecording.update({
      where: { id: recordingId },
      data: {
        ...(status && { status }),
        ...(fileUrl && { fileUrl }),
        ...(fileSize !== undefined && { fileSize }),
        ...(duration !== undefined && { duration }),
        ...(status === 'completed' && { endedAt: new Date() }),
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Update call recording error:', error);
    res.status(500).json({ error: 'Failed to update recording' });
  }
});

// Получить записи звонков чата
router.get('/chat/:chatId', async (req: AuthRequest, res) => {
  try {
    const { chatId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const recordings = await prisma.callRecording.findMany({
      where: { chatId },
      include: {
        recorder: {
          select: { id: true, username: true, displayName: true, avatar: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset),
    });

    res.json(recordings);
  } catch (error) {
    console.error('Get call recordings error:', error);
    res.status(500).json({ error: 'Failed to get recordings' });
  }
});

// Удалить запись
router.delete('/:recordingId', async (req: AuthRequest, res) => {
  try {
    const { recordingId } = req.params;

    const recording = await prisma.callRecording.findUnique({
      where: { id: recordingId },
    });

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    if (recording.recorderId !== req.userId!) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await prisma.callRecording.delete({ where: { id: recordingId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete call recording error:', error);
    res.status(500).json({ error: 'Failed to delete recording' });
  }
});

export default router;
