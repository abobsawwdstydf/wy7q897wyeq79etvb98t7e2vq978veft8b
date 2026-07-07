import { Router } from 'express';
import { prisma } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getSocket } from '../socket';

const router = Router();

// Get active drawing session for a chat
router.get('/chat/:chatId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.userId!;

    // Verify membership
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!member) {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }

    const session = await prisma.drawingSession.findFirst({
      where: { chatId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ session });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Create or get drawing session
router.post('/chat/:chatId/start', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.userId!;
    const { title } = req.body;

    // Verify membership
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!member) {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }

    // Close any existing active sessions
    await prisma.drawingSession.updateMany({
      where: { chatId, isActive: true },
      data: { isActive: false },
    });

    const session = await prisma.drawingSession.create({
      data: {
        chatId,
        createdBy: userId,
        title: title?.trim().slice(0, 100) || 'Доска',
        canvasData: null,
        isActive: true,
      },
    });

    // Notify chat members
    const io = getSocket();
    if (io) {
      io.to(`chat:${chatId}`).emit('drawing:session_started', {
        session,
        startedBy: userId,
      });
    }

    res.json({ session });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Update canvas data (save state)
router.put('/:sessionId/canvas', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.userId!;
    const { canvasData } = req.body;

    const session = await prisma.drawingSession.findUnique({ where: { id: sessionId } });
    if (!session || !session.isActive) {
      res.status(404).json({ error: 'Сессия не найдена' });
      return;
    }

    // Verify membership
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: session.chatId, userId } },
    });
    if (!member) {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }

    await prisma.drawingSession.update({
      where: { id: sessionId },
      data: { canvasData, updatedAt: new Date() },
    });

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Save drawing as image message and close session
router.post('/:sessionId/save', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.userId!;
    const { imageDataUrl } = req.body;

    const session = await prisma.drawingSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      res.status(404).json({ error: 'Сессия не найдена' });
      return;
    }

    // Verify membership
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: session.chatId, userId } },
    });
    if (!member) {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }

    // Close session
    await prisma.drawingSession.update({
      where: { id: sessionId },
      data: { isActive: false, canvasData: imageDataUrl },
    });

    // Notify chat members
    const io = getSocket();
    if (io) {
      io.to(`chat:${session.chatId}`).emit('drawing:session_ended', {
        sessionId,
        savedBy: userId,
        imageDataUrl,
      });
    }

    res.json({ success: true, imageDataUrl });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Close session without saving
router.delete('/:sessionId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.userId!;

    const session = await prisma.drawingSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      res.status(404).json({ error: 'Сессия не найдена' });
      return;
    }

    // Only creator or chat admin can close
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: session.chatId, userId } },
    });
    if (!member || (session.createdBy !== userId && member.role !== 'admin')) {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }

    await prisma.drawingSession.update({
      where: { id: sessionId },
      data: { isActive: false },
    });

    const io = getSocket();
    if (io) {
      io.to(`chat:${session.chatId}`).emit('drawing:session_ended', { sessionId });
    }

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
