import { Router } from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Get chat members as contacts
router.get('/chat/:chatId', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.chatId);

    // Check if user is member of chat
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member) {
      res.status(403).json({ error: 'Not a member of this chat' });
      return;
    }

    // Get all members
    const members = await prisma.chatMember.findMany({
      where: { chatId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            phone: true,
            bio: true,
            isVerified: true,
          },
        },
      },
    });

    res.json(members.map(m => m.user));
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
