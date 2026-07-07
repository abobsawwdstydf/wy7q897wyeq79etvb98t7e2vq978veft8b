import { Router } from 'express';
import { prisma } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import {
  sanitizeText,
  validateContentLength,
  CONTENT_LIMITS,
  wallPostLimiter,
  wallReactionLimiter,
  wallCommentLimiter,
} from '../lib/sanitize';

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

const ALLOWED_WALL_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
  'audio/mpeg', 'audio/ogg', 'audio/opus', 'audio/wav', 'audio/webm',
  'audio/aac', 'audio/mp4', 'audio/x-m4a', 'application/ogg',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
  'text/plain', 'text/csv',
];

const WALL_MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const WALL_MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200 MB total per request

function sanitizeUploadFilename(filename: string): string {
  let sanitized = path.basename(filename);
  sanitized = sanitized.replace(/[<>:"|?*]/g, '_');
  for (let i = 0; i < sanitized.length; i++) {
    const code = sanitized.charCodeAt(i);
    if (code >= 0x00 && code <= 0x1f) {
      sanitized = sanitized.substring(0, i) + '_' + sanitized.substring(i + 1);
    }
  }
  if (sanitized.length > 255) {
    const ext = path.extname(sanitized);
    sanitized = sanitized.substring(0, 255 - ext.length) + ext;
  }
  return sanitized;
}

const upload = multer({
  storage,
  limits: {
    fileSize: WALL_MAX_FILE_SIZE,
    files: 10,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    const allowedExts = ['jpg','jpeg','png','gif','webp','svg','bmp','mp4','webm','mov','avi','mkv',
      'mp3','ogg','opus','wav','m4a','aac','flac','pdf','doc','docx','xls','xlsx','ppt','pptx',
      'txt','csv','zip','rar','7z'];
    const extAllowed = allowedExts.includes(ext);
    const mimeAllowed = ALLOWED_WALL_MIME_TYPES.includes(file.mimetype.split(';')[0].trim().toLowerCase());

    if (mimeAllowed || extAllowed) {
      return cb(null, true);
    }
    cb(new Error('Неподдерживаемый тип файла'));
  }
});

function validateWallUploadTotalSize(files: Express.Multer.File[]): { valid: boolean; error?: string } {
  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > WALL_MAX_TOTAL_SIZE) {
    return { valid: false, error: `Общий размер файлов слишком большой. Максимум: ${Math.round(WALL_MAX_TOTAL_SIZE / 1024 / 1024 / 1024)} GB` };
  }
  return { valid: true };
}

// GET /api/wall/feed - получить ленту постов (умная сортировка, cursor-based pagination)
router.get('/feed', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { cursor, limit = '20' } = req.query;
    const take = Math.min(parseInt(limit as string), 50);
    const fetchSize = take * 3; // Запрашиваем 3x для чередования 1 популярный + 2 новых

    // Проход 1: популярные посты (по просмотрам)
    const popularWhere: any = {};
    if (cursor) {
      // Находим позицию курсора по viewsCount и createdAt
      const cursorPost = await prisma.wallPost.findUnique({ where: { id: cursor as string }, select: { viewsCount: true, createdAt: true } });
      if (cursorPost) {
        popularWhere.OR = [
          { viewsCount: { lt: cursorPost.viewsCount } },
          { viewsCount: cursorPost.viewsCount, createdAt: { lt: cursorPost.createdAt } }
        ];
      }
    }

    const popularPosts = await prisma.wallPost.findMany({
      where: popularWhere,
      select: {
        id: true, authorId: true, content: true, fontStyle: true,
        viewsCount: true, createdAt: true, updatedAt: true, originalPostId: true,
        media: { select: { id: true, type: true, url: true, thumbnail: true, duration: true, size: true, order: true }, orderBy: { order: 'asc' as const } },
        _count: { select: { reactions: true, comments: true } }
      },
      orderBy: [{ viewsCount: 'desc' as const }, { createdAt: 'desc' as const }],
      take: fetchSize
    });

    // Проход 2: новые посты (по дате)
    const recentWhere: any = {};
    if (cursor) {
      const cursorPost = await prisma.wallPost.findUnique({ where: { id: cursor as string }, select: { createdAt: true } });
      if (cursorPost) {
        recentWhere.createdAt = { lt: cursorPost.createdAt };
      }
    }

    const recentPosts = await prisma.wallPost.findMany({
      where: recentWhere,
      select: {
        id: true, authorId: true, content: true, fontStyle: true,
        viewsCount: true, createdAt: true, updatedAt: true, originalPostId: true,
        media: { select: { id: true, type: true, url: true, thumbnail: true, duration: true, size: true, order: true }, orderBy: { order: 'asc' as const } },
        _count: { select: { reactions: true, comments: true } }
      },
      orderBy: { createdAt: 'desc' as const },
      take: fetchSize
    });

    // Дедупликация и умное чередование: 1 популярный + 2 новых
    const seenIds = new Set<string>();
    const uniquePopular: any[] = [];
    const uniqueRecent: any[] = [];

    for (const p of popularPosts) {
      if (!seenIds.has(p.id)) { seenIds.add(p.id); uniquePopular.push(p); }
    }
    for (const p of recentPosts) {
      if (!seenIds.has(p.id)) { seenIds.add(p.id); uniqueRecent.push(p); }
    }

    const smartFeed: any[] = [];
    let popIdx = 0;
    let recIdx = 0;
    while (popIdx < uniquePopular.length || recIdx < uniqueRecent.length) {
      if (popIdx < uniquePopular.length) smartFeed.push(uniquePopular[popIdx++]);
      for (let i = 0; i < 2 && recIdx < uniqueRecent.length; i++) {
        smartFeed.push(uniqueRecent[recIdx++]);
      }
    }

    // Пагинация по результату
    const page = smartFeed.slice(0, take);
    const nextCursor = page.length === take ? page[page.length - 1].id : null;

    if (page.length === 0) {
      return res.json({ posts: [], nextCursor: null });
    }

    // Получаем реакции текущего пользователя для страницы
    const postIds = page.map((p: any) => p.id);
    const userReactions = await prisma.wallPostReaction.findMany({
      where: { postId: { in: postIds }, userId },
      select: { postId: true, emoji: true }
    });
    const userReactionMap = new Map(userReactions.map(r => [r.postId, r.emoji]));

    // Получаем информацию об авторах
    const authorIds = [...new Set(page.map((p: any) => p.authorId))];
    const authors = await prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: {
        id: true, username: true, displayName: true, avatar: true,
        isVerified: true, verifiedBadgeUrl: true, subscribersCount: true
      }
    });
    const authorsMap = new Map(authors.map(a => [a.id, a]));

    // Проверяем подписки
    const subscriptions = await prisma.wallSubscription.findMany({
      where: { subscriberId: userId, targetId: { in: authorIds } },
      select: { targetId: true }
    });
    const subscribedIds = new Set(subscriptions.map(s => s.targetId));

    // Форматируем посты
    const formattedPosts = page.map((post: any) => ({
      id: post.id, authorId: post.authorId, content: post.content,
      fontStyle: post.fontStyle, viewsCount: post.viewsCount,
      originalPostId: post.originalPostId,
      createdAt: post.createdAt, updatedAt: post.updatedAt,
      media: post.media,
      author: authorsMap.get(post.authorId),
      reactionsCount: post._count.reactions,
      commentsCount: post._count.comments,
      userReaction: userReactionMap.get(post.id) || null,
      isSubscribed: subscribedIds.has(post.authorId)
    }));

    res.json({ posts: formattedPosts, nextCursor });
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
router.post('/post', authenticateToken, wallPostLimiter, upload.fields([
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

    // SECURITY: Content length validation
    const contentLengthCheck = validateContentLength(content, CONTENT_LIMITS.WALL_POST);
    if (!contentLengthCheck.valid) {
      return res.status(400).json({ error: contentLengthCheck.error });
    }

    // SECURITY: Validate total upload size across all fields
    const allFiles: Express.Multer.File[] = [];
    for (const field of Object.values(files || {})) {
      allFiles.push(...field);
    }
    if (allFiles.length > 0) {
      const totalSizeCheck = validateWallUploadTotalSize(allFiles);
      if (!totalSizeCheck.valid) {
        return res.status(413).json({ error: totalSizeCheck.error });
      }
    }

    // SECURITY: Sanitize content
    const sanitizedContent = content ? sanitizeText(content) : null;

    // Создаем пост
    const post = await prisma.wallPost.create({
      data: {
        authorId: userId,
        content: sanitizedContent,
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
    if (sanitizedContent) {
      const hashtagRegex = /#(\w+)/g;
      const hashtags = [...sanitizedContent.matchAll(hashtagRegex)].map(m => m[1]);
      
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
    if (sanitizedContent) {
      const mentionRegex = /@(\w+)/g;
      const mentions = [...sanitizedContent.matchAll(mentionRegex)].map(m => m[1]);
      
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
router.post('/post/:postId/react', authenticateToken, wallReactionLimiter, async (req: AuthRequest, res) => {
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
router.post('/post/:postId/comment', authenticateToken, wallCommentLimiter, upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'voice', maxCount: 1 }
]), async (req: AuthRequest, res) => {
  try {
    const { postId } = req.params;
    const userId = req.userId!;
    const { content, parentId } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    // SECURITY: Content length validation
    const contentLengthCheck = validateContentLength(content, CONTENT_LIMITS.WALL_COMMENT);
    if (!contentLengthCheck.valid) {
      return res.status(400).json({ error: contentLengthCheck.error });
    }

    // SECURITY: Sanitize content
    const sanitizedContent = content ? sanitizeText(content) : null;

    let photoUrl = null;
    let voiceUrl = null;
    const voiceDuration = null;

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
        content: sanitizedContent,
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

// GET /api/wall/post/:postId/comments - получить комментарии поста (с пагинацией)
router.get('/post/:postId/comments', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { postId } = req.params;
    const offset = parseInt(req.query.offset as string) || 0;
    const limit = parseInt(req.query.limit as string) || 10;
    const sort = (req.query.sort as string) === 'popular' ? 'popular' : 'newest';

    const orderBy = sort === 'popular'
      ? { replies: { _count: 'desc' as const } }
      : { createdAt: 'desc' as const };

    const [comments, total] = await Promise.all([
      prisma.wallPostComment.findMany({
        where: {
          postId,
          parentId: null
        },
        include: {
          replies: {
            orderBy: { createdAt: 'asc' }
          }
        },
        orderBy,
        skip: offset,
        take: limit
      }),
      prisma.wallPostComment.count({
        where: {
          postId,
          parentId: null
        }
      })
    ]);

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

    res.json({ comments: formattedComments, total });
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Ошибка загрузки комментариев' });
  }
});

// GET /api/wall/search - поиск по постам (cursor-based pagination)
router.get('/search', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { q, cursor, limit = '20' } = req.query;
    const take = Math.min(parseInt(limit as string), 50);

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Поисковый запрос обязателен' });
    }

    const where: any = { content: { contains: q } };
    if (cursor) {
      const cursorPost = await prisma.wallPost.findUnique({
        where: { id: cursor as string },
        select: { createdAt: true }
      });
      if (cursorPost) {
        where.createdAt = { lt: cursorPost.createdAt };
      }
    }

    const posts = await prisma.wallPost.findMany({
      where,
      select: {
        id: true, authorId: true, content: true, fontStyle: true,
        viewsCount: true, createdAt: true, updatedAt: true, originalPostId: true,
        media: { select: { id: true, type: true, url: true, thumbnail: true, duration: true, size: true, order: true }, orderBy: { order: 'asc' as const } },
        _count: { select: { reactions: true, comments: true } }
      },
      orderBy: { createdAt: 'desc' as const },
      take: take + 1 // +1 чтобы определить hasMore
    });

    const hasMore = posts.length > take;
    const page = hasMore ? posts.slice(0, take) : posts;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    if (page.length === 0) {
      return res.json({ posts: [], nextCursor: null });
    }

    // Реакции текущего пользователя
    const postIds = page.map(p => p.id);
    const userReactions = await prisma.wallPostReaction.findMany({
      where: { postId: { in: postIds }, userId: req.userId! },
      select: { postId: true, emoji: true }
    });
    const userReactionMap = new Map(userReactions.map(r => [r.postId, r.emoji]));

    // Авторы
    const authorIds = [...new Set(page.map(p => p.authorId))];
    const authors = await prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: {
        id: true, username: true, displayName: true, avatar: true,
        isVerified: true, verifiedBadgeUrl: true, subscribersCount: true
      }
    });
    const authorsMap = new Map(authors.map(a => [a.id, a]));

    const formattedPosts = page.map(post => ({
      id: post.id, authorId: post.authorId, content: post.content,
      fontStyle: post.fontStyle, viewsCount: post.viewsCount,
      originalPostId: post.originalPostId,
      createdAt: post.createdAt, updatedAt: post.updatedAt,
      media: post.media,
      author: authorsMap.get(post.authorId),
      reactionsCount: post._count.reactions,
      commentsCount: post._count.comments,
      userReaction: userReactionMap.get(post.id) || null
    }));

    res.json({ posts: formattedPosts, nextCursor });
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
      select: {
        id: true, authorId: true, content: true, fontStyle: true,
        viewsCount: true, createdAt: true, originalPostId: true,
        media: { select: { id: true, type: true, url: true, thumbnail: true, duration: true, size: true, order: true } },
        _count: { select: { reactions: true, comments: true } }
      }
    });

    if (!post) {
      return res.status(404).json({ error: 'Пост не найден' });
    }

    // Создаем репост со ссылкой на оригинал
    const sharePost = await prisma.wallPost.create({
      data: {
        authorId: userId,
        content: `Поделился постом`,
        originalPostId: postId
      },
      select: {
        id: true, authorId: true, content: true, fontStyle: true,
        viewsCount: true, createdAt: true, updatedAt: true, originalPostId: true,
        media: { select: { id: true, type: true, url: true, thumbnail: true, duration: true, size: true, order: true } },
        _count: { select: { reactions: true, comments: true } }
      }
    });

    // Получаем информацию об авторе репоста
    const author = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, username: true, displayName: true, avatar: true,
        isVerified: true, verifiedBadgeUrl: true
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
