import { Router } from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Create drawing board for a call
router.post('/create', async (req: AuthRequest, res) => {
  try {
    const { callId, chatId } = req.body;
    
    if (!callId || !chatId) {
      res.status(400).json({ error: 'callId and chatId required' });
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

    res.json({ success: true, callId });
  } catch (error) {
    console.error('Create drawing board error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
