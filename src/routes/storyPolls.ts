import { Router } from 'express';
import { prisma } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Create a poll in a story
router.post('/:storyId/poll', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { storyId } = req.params;
    const { question, options, isAnonymous, durationMinutes } = req.body;

    if (!question || !options || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ error: 'question and at least 2 options required' });
    }

    // Verify story ownership
    const story = await prisma.story.findUnique({ where: { id: storyId }, select: { userId: true } });
    if (!story || story.userId !== userId) return res.status(403).json({ error: 'Not your story' });

    const poll = await prisma.storyPoll.create({
      data: {
        storyId,
        question,
        isAnonymous: isAnonymous || false,
        endsAt: durationMinutes ? new Date(Date.now() + durationMinutes * 60 * 1000) : null,
        options: {
          create: options.map((opt: string, i: number) => ({ text: opt, order: i })),
        },
      },
      include: { options: true },
    });

    res.json(poll);
  } catch (error) {
    console.error('Create story poll error:', error);
    res.status(500).json({ error: 'Failed to create poll' });
  }
});

// Get story poll
router.get('/:storyId/poll', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { storyId } = req.params;

    const poll = await prisma.storyPoll.findUnique({
      where: { storyId },
      include: {
        options: {
          include: { votes: true },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!poll) return res.status(404).json({ error: 'Poll not found' });

    // Check if ended
    const isEnded = poll.endsAt ? poll.endsAt < new Date() : false;
    const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes.length, 0);

    res.json({ ...poll, isEnded, totalVotes });
  } catch (error) {
    console.error('Get story poll error:', error);
    res.status(500).json({ error: 'Failed to get poll' });
  }
});

// Vote in a story poll
router.post('/:storyId/poll/vote', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { storyId } = req.params;
    const { optionId } = req.body;

    const poll = await prisma.storyPoll.findUnique({ where: { storyId }, include: { options: true } });
    if (!poll) return res.status(404).json({ error: 'Poll not found' });

    if (poll.endsAt && poll.endsAt < new Date()) {
      return res.status(400).json({ error: 'Poll has ended' });
    }

    // Verify option belongs to this poll
    const option = poll.options.find(o => o.id === optionId);
    if (!option) return res.status(400).json({ error: 'Invalid option' });

    // Remove existing vote from this user for this poll
    const existingVotes = await prisma.storyPollVote.findMany({
      where: {
        userId,
        option: { pollId: poll.id },
      },
    });

    if (existingVotes.length > 0) {
      await prisma.storyPollVote.deleteMany({
        where: { id: { in: existingVotes.map(v => v.id) } },
      });
    }

    await prisma.storyPollVote.create({
      data: { optionId, userId },
    });

    // Return updated poll
    const updatedPoll = await prisma.storyPoll.findUnique({
      where: { storyId },
      include: {
        options: {
          include: { votes: true },
          orderBy: { order: 'asc' },
        },
      },
    });

    const totalVotes = updatedPoll!.options.reduce((sum, opt) => sum + opt.votes.length, 0);
    res.json({ ...updatedPoll, totalVotes });
  } catch (error) {
    console.error('Vote story poll error:', error);
    res.status(500).json({ error: 'Failed to vote' });
  }
});

// Remove vote
router.delete('/:storyId/poll/vote', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { storyId } = req.params;

    const poll = await prisma.storyPoll.findUnique({ where: { storyId }, include: { options: true } });
    if (!poll) return res.status(404).json({ error: 'Poll not found' });

    const optionIds = poll.options.map(o => o.id);
    await prisma.storyPollVote.deleteMany({
      where: { userId, optionId: { in: optionIds } },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Remove vote error:', error);
    res.status(500).json({ error: 'Failed to remove vote' });
  }
});

export default router;
