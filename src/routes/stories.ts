import { Router } from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';
import { deleteUploadedFile } from '../shared';

const router = Router();

// Compact user select for stories (includes verification and tag)
const STORY_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
  isVerified: true,
  verifiedBadgeUrl: true,
  verifiedBadgeType: true,
  tagText: true,
  tagColor: true,
  tagStyle: true,
} as const;

// Get all active stories (grouped by user)
router.get('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const now = new Date();

    // Get accepted friends
    const friendships = await prisma.friendship.findMany({
      where: {
        status: 'accepted',
        OR: [{ userId }, { friendId: userId }],
      },
      select: { userId: true, friendId: true },
    });

    const friendIds = friendships.map(f =>
      f.userId === userId ? f.friendId : f.userId,
    );
    // Include own userId to see own stories
    friendIds.push(userId);

    const stories = await prisma.story.findMany({
      where: {
        userId: { in: friendIds },
        expiresAt: { gt: now },
      },
      include: {
        user: {
          select: STORY_USER_SELECT,
        },
        views: {
          select: { userId: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by user
    interface StoryItem {
      id: string;
      type: string;
      mediaUrl: string | null;
      content: string | null;
      bgColor: string | null;
      createdAt: Date;
      expiresAt: Date;
      viewCount: number;
      viewed: boolean;
    }
    interface StoryGroupResult {
      user: typeof stories[number]['user'];
      stories: StoryItem[];
      hasUnviewed: boolean;
    }
    const grouped: Record<string, StoryGroupResult> = {};
    for (const story of stories) {
      if (!grouped[story.userId]) {
        grouped[story.userId] = {
          user: story.user,
          stories: [],
          hasUnviewed: false,
        };
      }
      const viewed = story.views.some(v => v.userId === userId);
      grouped[story.userId].stories.push({
        id: story.id,
        type: story.type,
        mediaUrl: story.mediaUrl,
        content: story.content,
        bgColor: story.bgColor,
        createdAt: story.createdAt,
        expiresAt: story.expiresAt,
        viewCount: story.views.length,
        viewed,
      });
      if (!viewed && story.userId !== userId) {
        grouped[story.userId].hasUnviewed = true;
      }
    }

    // Own stories first, then unviewed, then viewed
    const result = Object.values(grouped).sort((a, b) => {
      if (a.user.id === userId) return -1;
      if (b.user.id === userId) return 1;
      if (a.hasUnviewed && !b.hasUnviewed) return -1;
      if (!a.hasUnviewed && b.hasUnviewed) return 1;
      return 0;
    });

    res.json(result);
  } catch (error) {
    console.error('Get stories error:', error);
    res.status(500).json({ error: 'Ошибка получения историй' });
  }
});

// Create a story
router.post('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { type, mediaUrl, content, bgColor } = req.body;

    // Validate mediaUrl to prevent path traversal
    if (mediaUrl) {
      if (typeof mediaUrl !== 'string' || mediaUrl.includes('..')) {
        res.status(400).json({ error: 'Недопустимый URL медиафайла' });
        return;
      }
      // Allow /uploads/, /api/files/, and external URLs
      const isValidUrl = mediaUrl.startsWith('/uploads/') || 
                         mediaUrl.startsWith('/api/files/') ||
                         mediaUrl.startsWith('http://') ||
                         mediaUrl.startsWith('https://');
      if (!isValidUrl) {
        res.status(400).json({ error: 'Недопустимый URL медиафайла' });
        return;
      }
    }

    const story = await prisma.story.create({
      data: {
        userId,
        type: type || 'text',
        mediaUrl,
        content,
        bgColor: bgColor || '#6366f1',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
      include: {
        user: {
          select: STORY_USER_SELECT,
        },
        views: true,
      },
    });

    res.json(story);
  } catch (error) {
    console.error('Create story error:', error);
    res.status(500).json({ error: 'Ошибка создания истории' });
  }
});

// View a story
router.post('/:storyId/view', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const storyId = req.params.storyId as string;

    // Verify story exists and viewer is the owner or a friend
    const story = await prisma.story.findUnique({ where: { id: storyId }, select: { userId: true } });
    if (!story) {
      res.status(404).json({ error: 'История не найдена' });
      return;
    }
    if (story.userId !== userId) {
      const friendship = await prisma.friendship.findFirst({
        where: {
          status: 'accepted',
          OR: [
            { userId, friendId: story.userId },
            { userId: story.userId, friendId: userId },
          ],
        },
      });
      if (!friendship) {
        res.status(403).json({ error: 'Нет доступа' });
        return;
      }
    }

    await prisma.storyView.upsert({
      where: { storyId_userId: { storyId, userId } },
      create: { storyId, userId },
      update: {},
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('View story error:', error);
    res.status(500).json({ error: 'Ошибка просмотра истории' });
  }
});

// Get story viewers
router.get('/:storyId/viewers', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const storyId = req.params.storyId as string;

    const story = await prisma.story.findUnique({ where: { id: storyId }, select: { userId: true } });
    if (!story || story.userId !== userId) {
      res.status(403).json({ error: 'Только автор может просматривать аудиторию' });
      return;
    }

    const views = await prisma.storyView.findMany({
      where: {
        storyId,
        user: { hideStoryViews: false },
      },
      include: {
        user: {
          select: STORY_USER_SELECT,
        },
      },
      orderBy: { viewedAt: 'desc' },
    });

    res.json(views.map(v => ({
      userId: v.userId,
      username: v.user.username,
      displayName: v.user.displayName,
      avatar: v.user.avatar,
      viewedAt: v.viewedAt,
    })));
  } catch (error) {
    console.error('Get story viewers error:', error);
    res.status(500).json({ error: 'Ошибка получения просмотров' });
  }
});

// Delete own story
router.delete('/:storyId', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const storyId = req.params.storyId as string;

    const story = await prisma.story.findUnique({ where: { id: storyId } });
    if (!story || story.userId !== userId) {
      res.status(403).json({ error: 'Нет прав' });
      return;
    }

    // Delete media file if present
    if (story.mediaUrl) deleteUploadedFile(story.mediaUrl);

    await prisma.story.delete({ where: { id: storyId } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete story error:', error);
    res.status(500).json({ error: 'Ошибка удаления истории' });
  }
});

// React to story (emoji)
router.post('/:storyId/react', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const storyId = req.params.storyId as string;
    const { emoji } = req.body;

    if (!emoji || typeof emoji !== 'string') {
      res.status(400).json({ error: 'Emoji обязателен' });
      return;
    }

    // Verify story exists and viewer is the owner or a friend
    const story = await prisma.story.findUnique({ where: { id: storyId }, select: { userId: true } });
    if (!story) {
      res.status(404).json({ error: 'История не найдена' });
      return;
    }
    
    if (story.userId !== userId) {
      const friendship = await prisma.friendship.findFirst({
        where: {
          status: 'accepted',
          OR: [
            { userId, friendId: story.userId },
            { userId: story.userId, friendId: userId },
          ],
        },
      });
      if (!friendship) {
        res.status(403).json({ error: 'Нет доступа' });
        return;
      }
    }

    await prisma.storyReaction.upsert({
      where: { storyId_userId: { storyId, userId } },
      create: { storyId, userId, emoji },
      update: { emoji },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('React to story error:', error);
    res.status(500).json({ error: 'Ошибка реакции на историю' });
  }
});

// Reply to story (DM)
router.post('/:storyId/reply', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const storyId = req.params.storyId as string;
    const { content } = req.body;

    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'Содержимое обязательно' });
      return;
    }

    // Verify story exists and viewer is the owner or a friend
    const story = await prisma.story.findUnique({ where: { id: storyId }, select: { userId: true } });
    if (!story) {
      res.status(404).json({ error: 'История не найдена' });
      return;
    }
    
    if (story.userId !== userId) {
      const friendship = await prisma.friendship.findFirst({
        where: {
          status: 'accepted',
          OR: [
            { userId, friendId: story.userId },
            { userId: story.userId, friendId: userId },
          ],
        },
      });
      if (!friendship) {
        res.status(403).json({ error: 'Нет доступа' });
        return;
      }
    }

    const reply = await prisma.storyReply.create({
      data: { storyId, userId, content },
    });

    res.json(reply);
  } catch (error) {
    console.error('Reply to story error:', error);
    res.status(500).json({ error: 'Ошибка ответа на историю' });
  }
});

// Get story reactions
router.get('/:storyId/reactions', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const storyId = req.params.storyId as string;

    const story = await prisma.story.findUnique({ where: { id: storyId }, select: { userId: true } });
    if (!story || story.userId !== userId) {
      res.status(403).json({ error: 'Только автор может просматривать реакции' });
      return;
    }

    const reactions = await prisma.storyReaction.findMany({
      where: { storyId },
      orderBy: { createdAt: 'desc' },
    });

    res.json(reactions);
  } catch (error) {
    console.error('Get story reactions error:', error);
    res.status(500).json({ error: 'Ошибка получения реакций' });
  }
});

// Get story replies
router.get('/:storyId/replies', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const storyId = req.params.storyId as string;

    const story = await prisma.story.findUnique({ where: { id: storyId }, select: { userId: true } });
    if (!story || story.userId !== userId) {
      res.status(403).json({ error: 'Только автор может просматривать ответы' });
      return;
    }

    const replies = await prisma.storyReply.findMany({
      where: { storyId },
      orderBy: { createdAt: 'desc' },
    });

    res.json(replies);
  } catch (error) {
    console.error('Get story replies error:', error);
    res.status(500).json({ error: 'Ошибка получения ответов' });
  }
});

// Save story to highlights
router.post('/:storyId/highlight', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const storyId = req.params.storyId as string;
    const { title, cover } = req.body;

    const story = await prisma.story.findUnique({ where: { id: storyId } });
    if (!story || story.userId !== userId) {
      res.status(403).json({ error: 'Нет прав' });
      return;
    }

    const updatedStory = await prisma.story.update({
      where: { id: storyId },
      data: {
        isHighlight: true,
        highlightTitle: title || 'Highlight',
        highlightCover: cover || story.mediaUrl,
      },
    });

    res.json(updatedStory);
  } catch (error) {
    console.error('Save to highlights error:', error);
    res.status(500).json({ error: 'Ошибка сохранения в highlights' });
  }
});

// Get user highlights
router.get('/highlights/:userId', async (req: AuthRequest, res) => {
  try {
    const targetUserId = req.params.userId as string;
    const currentUserId = req.userId!;

    // Check if viewer has access (self or friend)
    if (targetUserId !== currentUserId) {
      const friendship = await prisma.friendship.findFirst({
        where: {
          status: 'accepted',
          OR: [
            { userId: currentUserId, friendId: targetUserId },
            { userId: targetUserId, friendId: currentUserId },
          ],
        },
      });
      if (!friendship) {
        res.status(403).json({ error: 'Нет доступа' });
        return;
      }
    }

    const highlights = await prisma.story.findMany({
      where: {
        userId: targetUserId,
        isHighlight: true,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: STORY_USER_SELECT,
        },
      },
    });

    res.json(highlights);
  } catch (error) {
    console.error('Get highlights error:', error);
    res.status(500).json({ error: 'Ошибка получения highlights' });
  }
});

// Remove story from highlights
router.delete('/:storyId/highlight', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const storyId = req.params.storyId as string;

    const story = await prisma.story.findUnique({ where: { id: storyId } });
    if (!story || story.userId !== userId) {
      res.status(403).json({ error: 'Нет прав' });
      return;
    }

    const updatedStory = await prisma.story.update({
      where: { id: storyId },
      data: {
        isHighlight: false,
        highlightTitle: null,
        highlightCover: null,
      },
    });

    res.json(updatedStory);
  } catch (error) {
    console.error('Remove from highlights error:', error);
    res.status(500).json({ error: 'Ошибка удаления из highlights' });
  }
});

export default router;
