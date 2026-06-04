import { Router } from 'express';
import { prisma } from '../db';
import { AuthRequest, authenticateToken } from '../middleware/auth';

const router = Router();

// Создать сообщество
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId =   req.userId!;
    const { name, description, category, avatarUrl, coverUrl, isPublic } = req.body;

    if (!name || !category) {
      return res.status(400).json({ error: 'name и category обязательны' });
    }

    const community = await prisma.community.create({
      data: {
        name,
        description,
        category,
        avatarUrl,
        coverUrl,
        creatorId: userId,
        isPublic: isPublic !== false,
        memberCount: 1
      }
    });

    // Добавляем создателя как участника
    await prisma.communityMember.create({
      data: {
        communityId: community.id,
        userId
      }
    });

    // Добавляем как модератора
    await prisma.communityModerator.create({
      data: {
        communityId: community.id,
        userId,
        permissions: JSON.stringify(['all'])
      }
    });

    res.json(community);
  } catch (error: any) {
    console.error('Error creating community:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить все сообщества
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { category, search, sortBy = 'memberCount' } = req.query;

    const where: any = { isPublic: true };

    if (category) {
      where.category = category as string;
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string } },
        { description: { contains: search as string } }
      ];
    }

    const communities = await prisma.community.findMany({
      where,
      orderBy: sortBy === 'memberCount' ? { memberCount: 'desc' } : { createdAt: 'desc' },
      take: 50
    });

    res.json(communities);
  } catch (error: any) {
    console.error('Error fetching communities:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить сообщество
router.get('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const community = await prisma.community.findUnique({
      where: { id },
      include: {
        moderators: {
          take: 10
        },
        _count: {
          select: { posts: true, members: true }
        }
      }
    });

    if (!community) {
      return res.status(404).json({ error: 'Сообщество не найдено' });
    }

    res.json(community);
  } catch (error: any) {
    console.error('Error fetching community:', error);
    res.status(500).json({ error: error.message });
  }
});

// Вступить в сообщество
router.post('/:id/join', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId =   req.userId!;
    const { id } = req.params;

    const community = await prisma.community.findUnique({
      where: { id }
    });

    if (!community) {
      return res.status(404).json({ error: 'Сообщество не найдено' });
    }

    // Проверяем, не состоит ли уже
    const existing = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: id,
          userId
        }
      }
    });

    if (existing) {
      return res.status(400).json({ error: 'Вы уже состоите в сообществе' });
    }

    await prisma.communityMember.create({
      data: {
        communityId: id,
        userId
      }
    });

    // Увеличиваем счётчик
    await prisma.community.update({
      where: { id },
      data: { memberCount: { increment: 1 } }
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error joining community:', error);
    res.status(500).json({ error: error.message });
  }
});

// Покинуть сообщество
router.post('/:id/leave', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId =   req.userId!;
    const { id } = req.params;

    await prisma.communityMember.delete({
      where: {
        communityId_userId: {
          communityId: id,
          userId
        }
      }
    });

    // Уменьшаем счётчик
    await prisma.community.update({
      where: { id },
      data: { memberCount: { decrement: 1 } }
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error leaving community:', error);
    res.status(500).json({ error: error.message });
  }
});

// Создать пост
router.post('/:id/posts', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId =   req.userId!;
    const { id } = req.params;
    const { title, content, mediaUrls } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'title и content обязательны' });
    }

    // Проверяем членство
    const member = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: id,
          userId
        }
      }
    });

    if (!member) {
      return res.status(403).json({ error: 'Вы не состоите в сообществе' });
    }

    const post = await prisma.communityPost.create({
      data: {
        communityId: id,
        authorId: userId,
        title,
        content,
        mediaUrls: mediaUrls || []
      }
    });

    res.json(post);
  } catch (error: any) {
    console.error('Error creating post:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить посты сообщества
router.get('/:id/posts', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { sortBy = 'createdAt', limit = '20' } = req.query;

    const posts = await prisma.communityPost.findMany({
      where: { communityId: id },
      include: {
        _count: {
          select: { comments: true, votes: true }
        }
      },
      orderBy: sortBy === 'votes' ? { viewCount: 'desc' } : { createdAt: 'desc' },
      take: parseInt(limit as string)
    });

    // Подсчитываем рейтинг
    const postsWithScore = await Promise.all(posts.map(async (post) => {
      const votes = await prisma.communityVote.aggregate({
        where: { postId: post.id },
        _sum: { vote: true }
      });

      return {
        ...post,
        voteScore: votes._sum.vote || 0
      };
    }));

    res.json(postsWithScore);
  } catch (error: any) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить пост
router.get('/posts/:postId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { postId } = req.params;

    const post = await prisma.communityPost.findUnique({
      where: { id: postId },
      include: {
        comments: {
          where: { parentId: null },
          include: {
            replies: true
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!post) {
      return res.status(404).json({ error: 'Пост не найден' });
    }

    // Увеличиваем счётчик просмотров
    await prisma.communityPost.update({
      where: { id: postId },
      data: { viewCount: { increment: 1 } }
    });

    // Подсчитываем рейтинг
    const votes = await prisma.communityVote.aggregate({
      where: { postId },
      _sum: { vote: true }
    });

    res.json({
      ...post,
      voteScore: votes._sum.vote || 0
    });
  } catch (error: any) {
    console.error('Error fetching post:', error);
    res.status(500).json({ error: error.message });
  }
});

// Голосовать за пост
router.post('/posts/:postId/vote', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId =   req.userId!;
    const { postId } = req.params;
    const { vote } = req.body; // 1 или -1

    if (vote !== 1 && vote !== -1) {
      return res.status(400).json({ error: 'vote должен быть 1 или -1' });
    }

    await prisma.communityVote.upsert({
      where: {
        postId_userId: {
          postId,
          userId
        }
      },
      create: {
        postId,
        userId,
        vote
      },
      update: {
        vote
      }
    });

    // Подсчитываем общий счёт
    const votes = await prisma.communityVote.aggregate({
      where: { postId },
      _sum: { vote: true }
    });

    res.json({ voteScore: votes._sum.vote || 0 });
  } catch (error: any) {
    console.error('Error voting:', error);
    res.status(500).json({ error: error.message });
  }
});

// Добавить комментарий
router.post('/posts/:postId/comments', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId =   req.userId!;
    const { postId } = req.params;
    const { content, parentId } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content обязателен' });
    }

    const comment = await prisma.communityComment.create({
      data: {
        postId,
        authorId: userId,
        content,
        parentId
      }
    });

    res.json(comment);
  } catch (error: any) {
    console.error('Error creating comment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить топ участников
router.get('/:id/members/top', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { limit = '10' } = req.query;

    const members = await prisma.communityMember.findMany({
      where: { communityId: id },
      orderBy: { reputation: 'desc' },
      take: parseInt(limit as string)
    });

    res.json(members);
  } catch (error: any) {
    console.error('Error fetching top members:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
