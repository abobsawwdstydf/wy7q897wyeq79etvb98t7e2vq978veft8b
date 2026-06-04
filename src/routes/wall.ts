import { Router } from 'express';
import { prisma } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';

const router = Router();

// Multer для загрузки файлов
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'wall');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 3 * 1024 * 1024 * 1024, // 3 GB для видео
  },
  fileFilter: (req, file, cb) => {
    // Разрешаем все типы файлов для стены
    const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|webm|ogg|avi|mov|mp3|wav|m4a|aac|flac|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip|rar|7z/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    
    // Проверяем MIME type более гибко
    const allowedMimeTypes = [
      'image/', 'video/', 'audio/', 
      'application/pdf', 'application/msword', 'application/vnd.', 
      'text/', 'application/zip', 'application/x-rar', 'application/x-7z-compressed'
    ];
    const mimetypeAllowed = allowedMimeTypes.some(type => file.mimetype.startsWith(type));
    
    if (mimetypeAllowed || extname) {
      return cb(null, true);
    }
    cb(new Error('Неподдерживаемый тип файла'));
  }
});

// GET /api/wall/feed - получить ленту постов (умная сортировка)
router.get('/feed', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { offset = '0', limit = '20' } = req.query;
    const skip = parseInt(offset as string);
    const take = parseInt(limit as string);

    // Получаем все посты с медиа, реакциями и комментариями
    const allPosts = await prisma.wallPost.findMany({
      include: {
        media: {
          orderBy: { order: 'asc' }
        },
        reactions: {
          include: {
            post: false
          }
        },
        comments: {
          include: {
            replies: true
          }
        }
      },
      orderBy: [
        { viewsCount: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    // Умная сортировка: 1 популярный, 2 новых, 1 популярный, 2 новых...
    const popularPosts = allPosts.filter((_, i) => i % 3 === 0);
    const newPosts = allPosts.filter((_, i) => i % 3 !== 0);
    
    const smartFeed: any[] = [];
    let popIndex = 0;
    let newIndex = 0;
    
    while (popIndex < popularPosts.length || newIndex < newPosts.length) {
      // Добавляем 1 популярный
      if (popIndex < popularPosts.length) {
        smartFeed.push(popularPosts[popIndex++]);
      }
      // Добавляем 2 новых
      for (let i = 0; i < 2 && newIndex < newPosts.length; i++) {
        smartFeed.push(newPosts[newIndex++]);
      }
    }

    // Пагинация
    const paginatedFeed = smartFeed.slice(skip, skip + take);

    // Получаем информацию об авторах
    const authorIds = [...new Set(paginatedFeed.map(p => p.authorId))];
    const authors = await prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
        isVerified: true,
        verifiedBadgeUrl: true,
        subscribersCount: true
      }
    });

    const authorsMap = new Map(authors.map(a => [a.id, a]));

    // Форматируем посты
    const formattedPosts = paginatedFeed.map(post => ({
      ...post,
      author: authorsMap.get(post.authorId),
      reactionsCount: post.reactions.length,
      commentsCount: post.comments.length,
      userReaction: post.reactions.find((r: any) => r.userId === userId)?.emoji || null
    }));

    // Проверяем подписки на авторов
    const subscriptions = await prisma.wallSubscription.findMany({
      where: {
        subscriberId: userId,
        targetId: { in: authorIds }
      }
    });
    const subscribedIds = new Set(subscriptions.map(s => s.targetId));

    const postsWithSubscription = formattedPosts.map(post => ({
      ...post,
      isSubscribed: subscribedIds.has(post.authorId)
    }));

    res.json({
      posts: postsWithSubscription,
      hasMore: skip + take < smartFeed.length
    });
  } catch (error) {
    console.error('Error fetching wall feed:', error);
    res.status(500).json({ error: 'Ошибка загрузки ленты' });
  }
});

// GET /api/wall/friends - лента постов друзей
router.get('/friends', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { offset = '0', limit = '20' } = req.query;
    const skip = parseInt(offset as string);
    const take = parseInt(limit as string);

    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { userId, status: 'accepted' },
          { friendId: userId, status: 'accepted' },
        ],
      },
      select: {
        userId: true,
        friendId: true,
      },
    });

    const friendIds = friendships.map(f => f.userId === userId ? f.friendId : f.userId);

    if (friendIds.length === 0) {
      return res.json({ posts: [], hasMore: false });
    }

    const posts = await prisma.wallPost.findMany({
      where: { authorId: { in: friendIds } },
      include: {
        media: { orderBy: { order: 'asc' } },
        reactions: true,
        comments: { include: { replies: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });

    const authorIds = [...new Set(posts.map(p => p.authorId))];
    const authors = await prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
        isVerified: true,
        verifiedBadgeUrl: true,
      },
    });

    const authorMap = new Map(authors.map(a => [a.id, a]));

    const formatted = posts.map(post => ({
      ...post,
      author: authorMap.get(post.authorId) || { id: post.authorId, username: 'unknown', displayName: 'Unknown', avatar: null, isVerified: false, verifiedBadgeUrl: null },
      reactionsCount: post.reactions.length,
      commentsCount: post.comments.length,
      userReaction: post.reactions.find(r => r.userId === userId)?.emoji || null,
    }));

    res.json({
      posts: formatted,
      hasMore: posts.length === take,
    });
  } catch (error) {
    console.error('Error fetching friends feed:', error);
    res.status(500).json({ error: 'Ошибка загрузки ленты друзей' });
  }
});

// GET /api/wall/post/:postId - получить один пост по ID
router.get('/post/:postId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { postId } = req.params;

    const post = await prisma.wallPost.findUnique({
      where: { id: postId },
      include: {
        media: {
          orderBy: { order: 'asc' }
        },
        reactions: true,
        comments: {
          include: {
            replies: true
          }
        }
      }
    });

    if (!post) {
      return res.status(404).json({ error: 'Пост не найден' });
    }

    const author = await prisma.user.findUnique({
      where: { id: post.authorId },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
        isVerified: true,
        verifiedBadgeUrl: true,
        verifiedBadgeType: true,
        subscribersCount: true
      }
    });

    const subscription = await prisma.wallSubscription.findFirst({
      where: {
        subscriberId: userId,
        targetId: post.authorId
      }
    });

    const formattedPost = {
      ...post,
      author,
      reactionsCount: post.reactions.length,
      commentsCount: post.comments.length,
      userReaction: post.reactions.find(r => r.userId === userId)?.emoji || null,
      isSubscribed: !!subscription
    };

    res.json(formattedPost);
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({ error: 'Ошибка загрузки поста' });
  }
});

// GET /api/wall/user/:userId - получить посты пользователя
router.get('/user/:userId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const { offset = '0', limit = '20' } = req.query;
    const skip = parseInt(offset as string);
    const take = parseInt(limit as string);

    const posts = await prisma.wallPost.findMany({
      where: { authorId: userId },
      include: {
        media: {
          orderBy: { order: 'asc' }
        },
        reactions: true,
        comments: {
          include: {
            replies: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    });

    // Получаем информацию об авторе
    const author = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
        isVerified: true,
        verifiedBadgeUrl: true,
        subscribersCount: true
      }
    });

    const formattedPosts = posts.map(post => ({
      ...post,
      author,
      reactionsCount: post.reactions.length,
      commentsCount: post.comments.length,
      userReaction: post.reactions.find(r => r.userId === req.userId!)?.emoji || null
    }));

    const total = await prisma.wallPost.count({
      where: { authorId: userId }
    });

    res.json({
      posts: formattedPosts,
      hasMore: skip + take < total
    });
  } catch (error) {
    console.error('Error fetching user posts:', error);
    res.status(500).json({ error: 'Ошибка загрузки постов пользователя' });
  }
});

// POST /api/wall/post - создать новый пост
router.post('/post', authenticateToken, upload.fields([
  { name: 'photos', maxCount: 2 },
  { name: 'videos', maxCount: 1 },
  { name: 'audios', maxCount: 1 },
  { name: 'files', maxCount: 5 },
  { name: 'voice', maxCount: 1 }
]), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { content, fontStyle } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    // Создаем пост
    const post = await prisma.wallPost.create({
      data: {
        authorId: userId,
        content: content || null,
        fontStyle: fontStyle || null
      }
    });

    // Добавляем медиа файлы
    const mediaPromises: Promise<any>[] = [];
    let order = 0;

    // Фото (до 2 штук)
    if (files.photos) {
      for (const photo of files.photos.slice(0, 2)) {
        mediaPromises.push(
          prisma.wallPostMedia.create({
            data: {
              postId: post.id,
              type: 'photo',
              url: `/uploads/wall/${photo.filename}`,
              size: photo.size,
              order: order++
            }
          })
        );
      }
    }

    // Видео (только 1)
    if (files.videos && files.videos[0]) {
      const video = files.videos[0];
      mediaPromises.push(
        prisma.wallPostMedia.create({
          data: {
            postId: post.id,
            type: 'video',
            url: `/uploads/wall/${video.filename}`,
            size: video.size,
            order: order++
          }
        })
      );
    }

    // Аудио (только 1)
    if (files.audios && files.audios[0]) {
      const audio = files.audios[0];
      mediaPromises.push(
        prisma.wallPostMedia.create({
          data: {
            postId: post.id,
            type: 'audio',
            url: `/uploads/wall/${audio.filename}`,
            size: audio.size,
            order: order++
          }
        })
      );
    }

    // Файлы (до 5 штук)
    if (files.files) {
      for (const file of files.files.slice(0, 5)) {
        mediaPromises.push(
          prisma.wallPostMedia.create({
            data: {
              postId: post.id,
              type: 'file',
              url: `/uploads/wall/${file.filename}`,
              size: file.size,
              order: order++
            }
          })
        );
      }
    }

    // Голосовое (только 1)
    if (files.voice && files.voice[0]) {
      const voice = files.voice[0];
      mediaPromises.push(
        prisma.wallPostMedia.create({
          data: {
            postId: post.id,
            type: 'voice',
            url: `/uploads/wall/${voice.filename}`,
            size: voice.size,
            order: order++
          }
        })
      );
    }

    await Promise.all(mediaPromises);

    // Обработка хэштегов
    if (content) {
      const hashtagRegex = /#(\w+)/g;
      const hashtags = [...content.matchAll(hashtagRegex)].map(m => m[1]);
      
      for (const tag of hashtags) {
        // Проверяем, существует ли хэштег
        let hashtag = await prisma.wallHashtag.findUnique({
          where: { tag }
        });

        if (!hashtag) {
          // Создаем новый хэштег (владелец - текущий пользователь)
          hashtag = await prisma.wallHashtag.create({
            data: {
              tag,
              ownerId: userId,
              useCount: 1,
              ownerUseCount: 1
            }
          });
        } else {
          // Увеличиваем счетчик использований
          const isOwner = hashtag.ownerId === userId;
          await prisma.wallHashtag.update({
            where: { id: hashtag.id },
            data: {
              useCount: { increment: 1 },
              ...(isOwner ? { ownerUseCount: { increment: 1 } } : {})
            }
          });
        }

        // Связываем пост с хэштегом
        await prisma.wallPostHashtag.create({
          data: {
            postId: post.id,
            hashtagId: hashtag.id
          }
        });
      }
    }

    // Обработка упоминаний
    if (content) {
      const mentionRegex = /@(\w+)/g;
      const mentions = [...content.matchAll(mentionRegex)].map(m => m[1]);
      
      for (const username of mentions) {
        // Находим пользователя
        const mentionedUser = await prisma.user.findUnique({
          where: { username }
        });

        if (mentionedUser) {
          await prisma.wallMention.create({
            data: {
              postId: post.id,
              userId: mentionedUser.id
            }
          });
        }
      }
    }

    // Получаем полный пост с медиа
    const fullPost = await prisma.wallPost.findUnique({
      where: { id: post.id },
      include: {
        media: {
          orderBy: { order: 'asc' }
        },
        reactions: true,
        comments: true,
        hashtags: {
          include: {
            hashtag: true
          }
        },
        mentions: true
      }
    });

    // Получаем информацию об авторе
    const author = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
        isVerified: true,
        verifiedBadgeUrl: true,
        subscribersCount: true
      }
    });

    res.json({
      ...fullPost,
      author,
      reactionsCount: 0,
      commentsCount: 0,
      userReaction: null,
      isSubscribed: false
    });
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ error: 'Ошибка создания поста' });
  }
});

// POST /api/wall/post/:postId/view - отметить просмотр поста
router.post('/post/:postId/view', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { postId } = req.params;
    const userId = req.userId!;

    // Проверяем, не просматривал ли уже
    const existingView = await prisma.wallPostView.findUnique({
      where: {
        postId_userId: {
          postId,
          userId
        }
      }
    });

    if (!existingView) {
      // Создаем просмотр
      await prisma.wallPostView.create({
        data: {
          postId,
          userId
        }
      });

      // Увеличиваем счетчик просмотров
      await prisma.wallPost.update({
        where: { id: postId },
        data: {
          viewsCount: {
            increment: 1
          }
        }
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error recording post view:', error);
    res.status(500).json({ error: 'Ошибка записи просмотра' });
  }
});

// POST /api/wall/post/:postId/react - добавить/удалить реакцию
router.post('/post/:postId/react', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { postId } = req.params;
    const userId = req.userId!;
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({ error: 'Эмодзи обязателен' });
    }

    // Проверяем, есть ли уже такая реакция
    const existingReaction = await prisma.wallPostReaction.findUnique({
      where: {
        postId_userId_emoji: {
          postId,
          userId,
          emoji
        }
      }
    });

    if (existingReaction) {
      // Удаляем реакцию
      await prisma.wallPostReaction.delete({
        where: { id: existingReaction.id }
      });
      res.json({ action: 'removed' });
    } else {
      // Добавляем реакцию
      await prisma.wallPostReaction.create({
        data: {
          postId,
          userId,
          emoji
        }
      });
      res.json({ action: 'added' });
    }
  } catch (error) {
    console.error('Error toggling reaction:', error);
    res.status(500).json({ error: 'Ошибка изменения реакции' });
  }
});

// GET /api/wall/post/:postId/reactions - получить все реакции поста
router.get('/post/:postId/reactions', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { postId } = req.params;

    const reactions = await prisma.wallPostReaction.findMany({
      where: { postId }
    });

    // Группируем по эмодзи
    const grouped = reactions.reduce((acc: any, r) => {
      if (!acc[r.emoji]) {
        acc[r.emoji] = {
          emoji: r.emoji,
          count: 0,
          users: []
        };
      }
      acc[r.emoji].count++;
      acc[r.emoji].users.push(r.userId);
      return acc;
    }, {});

    res.json(Object.values(grouped));
  } catch (error) {
    console.error('Error fetching reactions:', error);
    res.status(500).json({ error: 'Ошибка загрузки реакций' });
  }
});

// POST /api/wall/post/:postId/comment - добавить комментарий
router.post('/post/:postId/comment', authenticateToken, upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'voice', maxCount: 1 }
]), async (req: AuthRequest, res) => {
  try {
    const { postId } = req.params;
    const userId = req.userId!;
    const { content, parentId } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    let photoUrl = null;
    let voiceUrl = null;
    let voiceDuration = null;

    if (files.photo && files.photo[0]) {
      photoUrl = `/uploads/wall/${files.photo[0].filename}`;
    }

    if (files.voice && files.voice[0]) {
      voiceUrl = `/uploads/wall/${files.voice[0].filename}`;
      // TODO: определить длительность голосового
    }

    const comment = await prisma.wallPostComment.create({
      data: {
        postId,
        authorId: userId,
        parentId: parentId || null,
        content: content || null,
        photoUrl,
        voiceUrl,
        voiceDuration
      }
    });

    // Получаем информацию об авторе
    const author = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
        isVerified: true,
        verifiedBadgeUrl: true,
        subscribersCount: true
      }
    });

    res.json({
      ...comment,
      author,
      replies: []
    });
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ error: 'Ошибка создания комментария' });
  }
});

// GET /api/wall/post/:postId/comments - получить комментарии поста
router.get('/post/:postId/comments', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { postId } = req.params;

    const comments = await prisma.wallPostComment.findMany({
      where: {
        postId,
        parentId: null // Только корневые комментарии
      },
      include: {
        replies: {
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Получаем информацию об авторах
    const authorIds = [
      ...comments.map(c => c.authorId),
      ...comments.flatMap(c => c.replies.map(r => r.authorId))
    ];
    const uniqueAuthorIds = [...new Set(authorIds)];

    const authors = await prisma.user.findMany({
      where: { id: { in: uniqueAuthorIds } },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
        isVerified: true,
        verifiedBadgeUrl: true,
        subscribersCount: true
      }
    });

    const authorsMap = new Map(authors.map(a => [a.id, a]));

    // Форматируем комментарии
    const formattedComments = comments.map(comment => ({
      ...comment,
      author: authorsMap.get(comment.authorId),
      replies: comment.replies.map(reply => ({
        ...reply,
        author: authorsMap.get(reply.authorId)
      }))
    }));

    res.json(formattedComments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Ошибка загрузки комментариев' });
  }
});

// GET /api/wall/search - поиск по постам
router.get('/search', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { q, offset = '0', limit = '20' } = req.query;
    const skip = parseInt(offset as string);
    const take = parseInt(limit as string);

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Поисковый запрос обязателен' });
    }

    const posts = await prisma.wallPost.findMany({
      where: {
        content: {
          contains: q
        }
      },
      include: {
        media: {
          orderBy: { order: 'asc' }
        },
        reactions: true,
        comments: {
          include: {
            replies: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    });

    // Получаем информацию об авторах
    const authorIds = [...new Set(posts.map(p => p.authorId))];
    const authors = await prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
        isVerified: true,
        verifiedBadgeUrl: true,
        subscribersCount: true
      }
    });

    const authorsMap = new Map(authors.map(a => [a.id, a]));

    const formattedPosts = posts.map(post => ({
      ...post,
      author: authorsMap.get(post.authorId),
      reactionsCount: post.reactions.length,
      commentsCount: post.comments.length,
      userReaction: post.reactions.find(r => r.userId === req.userId!)?.emoji || null
    }));

    const total = await prisma.wallPost.count({
      where: {
        content: {
          contains: q
        }
      }
    });

    res.json({
      posts: formattedPosts,
      hasMore: skip + take < total
    });
  } catch (error) {
    console.error('Error searching posts:', error);
    res.status(500).json({ error: 'Ошибка поиска постов' });
  }
});

// DELETE /api/wall/post/:postId - удалить пост
router.delete('/post/:postId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { postId } = req.params;
    const userId = req.userId!;

    const post = await prisma.wallPost.findUnique({
      where: { id: postId }
    });

    if (!post) {
      return res.status(404).json({ error: 'Пост не найден' });
    }

    if (post.authorId !== userId) {
      return res.status(403).json({ error: 'Нет прав на удаление' });
    }

    await prisma.wallPost.delete({
      where: { id: postId }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ error: 'Ошибка удаления поста' });
  }
});

// POST /api/wall/user/:userId/subscribe - подписаться на пользователя
router.post('/user/:userId/subscribe', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId: targetId } = req.params;
    const subscriberId = req.userId!;

    if (subscriberId === targetId) {
      return res.status(400).json({ error: 'Нельзя подписаться на себя' });
    }

    // Проверяем, не подписан ли уже
    const existing = await prisma.wallSubscription.findUnique({
      where: {
        subscriberId_targetId: {
          subscriberId,
          targetId
        }
      }
    });

    if (existing) {
      // Отписываемся
      await prisma.wallSubscription.delete({
        where: { id: existing.id }
      });

      // Уменьшаем счетчик подписчиков
      await prisma.user.update({
        where: { id: targetId },
        data: {
          subscribersCount: {
            decrement: 1
          }
        }
      });

      res.json({ action: 'unsubscribed' });
    } else {
      // Подписываемся
      await prisma.wallSubscription.create({
        data: {
          subscriberId,
          targetId
        }
      });

      // Увеличиваем счетчик подписчиков
      await prisma.user.update({
        where: { id: targetId },
        data: {
          subscribersCount: {
            increment: 1
          }
        }
      });

      res.json({ action: 'subscribed' });
    }
  } catch (error) {
    console.error('Error toggling subscription:', error);
    res.status(500).json({ error: 'Ошибка изменения подписки' });
  }
});

// GET /api/wall/user/:userId/subscription-status - проверить статус подписки
router.get('/user/:userId/subscription-status', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId: targetId } = req.params;
    const subscriberId = req.userId!;

    const subscription = await prisma.wallSubscription.findUnique({
      where: {
        subscriberId_targetId: {
          subscriberId,
          targetId
        }
      }
    });

    res.json({ isSubscribed: !!subscription });
  } catch (error) {
    console.error('Error checking subscription:', error);
    res.status(500).json({ error: 'Ошибка проверки подписки' });
  }
});

// GET /api/wall/hashtags/owned - получить хэштеги пользователя
router.get('/hashtags/owned', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const hashtags = await prisma.wallHashtag.findMany({
      where: { ownerId: userId },
      orderBy: { ownerUseCount: 'desc' }
    });

    res.json(hashtags);
  } catch (error) {
    console.error('Error fetching owned hashtags:', error);
    res.status(500).json({ error: 'Ошибка загрузки хэштегов' });
  }
});

// GET /api/wall/hashtag/:tag/posts - получить посты по хэштегу
router.get('/hashtag/:tag/posts', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { tag } = req.params;
    const { offset = '0', limit = '20' } = req.query;
    const skip = parseInt(offset as string);
    const take = parseInt(limit as string);

    const hashtag = await prisma.wallHashtag.findUnique({
      where: { tag }
    });

    if (!hashtag) {
      return res.json({ posts: [], hasMore: false });
    }

    // Получаем информацию о создателе хештега
    const owner = await prisma.user.findUnique({
      where: { id: hashtag.ownerId },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
        isVerified: true
      }
    });

    const postHashtags = await prisma.wallPostHashtag.findMany({
      where: { hashtagId: hashtag.id },
      include: {
        post: {
          include: {
            media: {
              orderBy: { order: 'asc' }
            },
            reactions: true,
            comments: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    });

    const posts = postHashtags.map(ph => ph.post);

    // Получаем информацию об авторах
    const authorIds = [...new Set(posts.map(p => p.authorId))];
    const authors = await prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
        isVerified: true,
        verifiedBadgeUrl: true,
        subscribersCount: true
      }
    });

    const authorsMap = new Map(authors.map(a => [a.id, a]));

    const formattedPosts = posts.map(post => ({
      ...post,
      author: authorsMap.get(post.authorId),
      reactionsCount: post.reactions.length,
      commentsCount: post.comments.length,
      userReaction: post.reactions.find((r: any) => r.userId === req.userId!)?.emoji || null
    }));

    const total = await prisma.wallPostHashtag.count({
      where: { hashtagId: hashtag.id }
    });

    res.json({
      posts: formattedPosts,
      hasMore: skip + take < total,
      hashtag: {
        ...hashtag,
        owner
      }
    });
  } catch (error) {
    console.error('Error fetching hashtag posts:', error);
    res.status(500).json({ error: 'Ошибка загрузки постов по хэштегу' });
  }
});

// POST /api/wall/post/:postId/share - поделиться постом
router.post('/post/:postId/share', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { postId } = req.params;
    const userId = req.userId!;

    const post = await prisma.wallPost.findUnique({
      where: { id: postId },
      include: {
        media: true,
        reactions: true,
        comments: true,
        hashtags: true,
        mentions: true
      }
    });

    if (!post) {
      return res.status(404).json({ error: 'Пост не найден' });
    }

    // Создаем репост (новый пост со ссылкой на оригинал)
    const sharePost = await prisma.wallPost.create({
      data: {
        authorId: userId,
        content: `Поделился постом`,
      },
      include: {
        media: true,
        reactions: true,
        comments: true
      }
    });

    // Получаем информацию об авторе репоста
    const author = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
        isVerified: true,
        verifiedBadgeUrl: true
      }
    });

    res.json({
      ...sharePost,
      author,
      originalPost: post,
      reactionsCount: 0,
      commentsCount: 0,
      userReaction: null
    });
  } catch (error) {
    console.error('Error sharing post:', error);
    res.status(500).json({ error: 'Ошибка при репосте' });
  }
});

export default router;
