import { Router, Response } from 'express';
import { prisma } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import crypto from 'crypto';

const router = Router();

/**
 * GET /api/folders - Получить все папки пользователя
 */
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const folders = await prisma.chatFolder.findMany({
      where: { userId },
      include: {
        chats: {
          include: {
            members: {
              where: { userId },
              select: {
                isMuted: true,
                isPinned: true,
                isArchived: true,
              },
            },
          },
        },
      },
      orderBy: { order: 'asc' },
    });

    res.json(folders);
  } catch (error) {
    console.error('Ошибка получения папок:', error);
    res.status(500).json({ error: 'Ошибка получения папок' });
  }
});

/**
 * POST /api/folders - Создать новую папку
 */
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { name, icon, color } = req.body;

    if (!name || name.trim().length === 0) {
      res.status(400).json({ error: 'Название папки обязательно' });
      return;
    }

    // Получаем максимальный order для новой папки
    const maxOrder = await prisma.chatFolder.findFirst({
      where: { userId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const folder = await prisma.chatFolder.create({
      data: {
        userId,
        name: name.trim(),
        icon: icon || '📁',
        color: color || '#6366f1',
        order: (maxOrder?.order || 0) + 1,
      },
      include: {
        chats: true,
      },
    });

    res.json(folder);
  } catch (error) {
    console.error('Ошибка создания папки:', error);
    res.status(500).json({ error: 'Ошибка создания папки' });
  }
});

/**
 * PUT /api/folders/:id - Обновить папку
 */
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const id = String(req.params.id);
    const { name, icon, color, order } = req.body;

    // Проверяем что папка принадлежит пользователю
    const existing = await prisma.chatFolder.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      res.status(404).json({ error: 'Папка не найдена' });
      return;
    }

    const folder = await prisma.chatFolder.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(icon !== undefined && { icon }),
        ...(color !== undefined && { color }),
        ...(order !== undefined && { order }),
      },
      include: {
        chats: true,
      },
    });

    res.json(folder);
  } catch (error) {
    console.error('Ошибка обновления папки:', error);
    res.status(500).json({ error: 'Ошибка обновления папки' });
  }
});

/**
 * DELETE /api/folders/:id - Удалить папку
 */
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const id = String(req.params.id);

    // Проверяем что папка принадлежит пользователю
    const existing = await prisma.chatFolder.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      res.status(404).json({ error: 'Папка не найдена' });
      return;
    }

    await prisma.chatFolder.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка удаления папки:', error);
    res.status(500).json({ error: 'Ошибка удаления папки' });
  }
});

/**
 * POST /api/folders/:id/chats - Добавить чат в папку
 */
router.post('/:id/chats', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const id = String(req.params.id);
    const { chatId } = req.body;

    if (!chatId) {
      res.status(400).json({ error: 'chatId обязателен' });
      return;
    }

    // Проверяем что папка принадлежит пользователю
    const folder = await prisma.chatFolder.findFirst({
      where: { id, userId },
    });

    if (!folder) {
      res.status(404).json({ error: 'Папка не найдена' });
      return;
    }

    // Проверяем что пользователь является участником чата
    const membership = await prisma.chatMember.findFirst({
      where: { chatId, userId },
    });

    if (!membership) {
      res.status(403).json({ error: 'Вы не являетесь участником этого чата' });
      return;
    }

    // Добавляем чат в папку
    await prisma.chatFolder.update({
      where: { id },
      data: {
        chats: {
          connect: { id: chatId },
        },
      },
    });

    const updated = await prisma.chatFolder.findUnique({
      where: { id },
      include: {
        chats: true,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Ошибка добавления чата в папку:', error);
    res.status(500).json({ error: 'Ошибка добавления чата в папку' });
  }
});

/**
 * DELETE /api/folders/:id/chats/:chatId - Убрать чат из папки
 */
router.delete('/:id/chats/:chatId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const id = String(req.params.id);
    const chatId = String(req.params.chatId);

    // Проверяем что папка принадлежит пользователю
    const folder = await prisma.chatFolder.findFirst({
      where: { id, userId },
    });

    if (!folder) {
      res.status(404).json({ error: 'Папка не найдена' });
      return;
    }

    // Убираем чат из папки
    await prisma.chatFolder.update({
      where: { id },
      data: {
        chats: {
          disconnect: { id: chatId },
        },
      },
    });

    const updated = await prisma.chatFolder.findUnique({
      where: { id },
      include: {
        chats: true,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Ошибка удаления чата из папки:', error);
    res.status(500).json({ error: 'Ошибка удаления чата из папки' });
  }
});

/**
 * POST /api/folders/:id/share - Создать ссылку для шаринга папки
 */
router.post('/:id/share', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const id = String(req.params.id);
    const { expiresIn, maxUses } = req.body;

    // Проверяем что папка принадлежит пользователю
    const folder = await prisma.chatFolder.findFirst({
      where: { id, userId },
      include: {
        chats: {
          select: {
            id: true,
            name: true,
            username: true,
            type: true,
          },
        },
      },
    });

    if (!folder) {
      res.status(404).json({ error: 'Папка не найдена' });
      return;
    }

    // Генерируем уникальный токен
    const token = crypto.randomBytes(16).toString('hex');

    // Вычисляем дату истечения
    let expiresAt: Date | null = null;
    if (expiresIn) {
      expiresAt = new Date(Date.now() + expiresIn * 1000);
    }

    // Создаём ссылку
    const link = await prisma.sharedFolderLink.create({
      data: {
        folderId: id,
        userId,
        token,
        expiresAt,
        maxUses: maxUses || null,
      },
    });

    res.json({
      token,
      url: `${req.protocol}://${req.get('host')}/folder/${token}`,
      expiresAt,
      maxUses,
      folder: {
        name: folder.name,
        icon: folder.icon,
        color: folder.color,
        chatsCount: folder.chats.length,
      },
    });
  } catch (error) {
    console.error('Ошибка создания ссылки:', error);
    res.status(500).json({ error: 'Ошибка создания ссылки' });
  }
});

/**
 * GET /api/folders/shared/:token - Получить информацию о shared папке
 */
router.get('/shared/:token', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const token = String(req.params.token);

    const link = await prisma.sharedFolderLink.findUnique({
      where: { token },
      include: {
        folder: {
          include: {
            chats: {
              select: {
                id: true,
                name: true,
                username: true,
                type: true,
                avatar: true,
                description: true,
                isVerified: true,
                verifiedBadgeUrl: true,
                verifiedBadgeType: true,
              },
            },
          },
        },
      },
    });

    if (!link) {
      res.status(404).json({ error: 'Ссылка не найдена' });
      return;
    }

    // Проверяем срок действия
    if (link.expiresAt && link.expiresAt < new Date()) {
      res.status(410).json({ error: 'Ссылка истекла' });
      return;
    }

    // Проверяем лимит использований
    if (link.maxUses && link.usedCount >= link.maxUses) {
      res.status(410).json({ error: 'Ссылка исчерпала лимит использований' });
      return;
    }

    res.json({
      folder: {
        name: link.folder.name,
        icon: link.folder.icon,
        color: link.folder.color,
        chats: link.folder.chats,
      },
      expiresAt: link.expiresAt,
      usedCount: link.usedCount,
      maxUses: link.maxUses,
    });
  } catch (error) {
    console.error('Ошибка получения shared папки:', error);
    res.status(500).json({ error: 'Ошибка получения shared папки' });
  }
});

/**
 * POST /api/folders/shared/:token/add - Добавить shared папку к себе
 */
router.post('/shared/:token/add', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const token = String(req.params.token);

    const link = await prisma.sharedFolderLink.findUnique({
      where: { token },
      include: {
        folder: {
          include: {
            chats: true,
          },
        },
      },
    });

    if (!link) {
      res.status(404).json({ error: 'Ссылка не найдена' });
      return;
    }

    // Проверяем срок действия
    if (link.expiresAt && link.expiresAt < new Date()) {
      res.status(410).json({ error: 'Ссылка истекла' });
      return;
    }

    // Проверяем лимит использований
    if (link.maxUses && link.usedCount >= link.maxUses) {
      res.status(410).json({ error: 'Ссылка исчерпала лимит использований' });
      return;
    }

    // Проверяем, не добавлял ли пользователь уже эту папку
    const existingFolder = await prisma.chatFolder.findFirst({
      where: {
        userId,
        name: link.folder.name,
      },
    });

    if (existingFolder) {
      res.status(400).json({ error: 'У вас уже есть папка с таким названием' });
      return;
    }

    // Получаем максимальный order для новой папки
    const maxOrder = await prisma.chatFolder.findFirst({
      where: { userId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    // Создаём новую папку для пользователя
    const newFolder = await prisma.chatFolder.create({
      data: {
        userId,
        name: link.folder.name,
        icon: link.folder.icon || '📁',
        color: link.folder.color || '#6366f1',
        order: (maxOrder?.order || 0) + 1,
      },
    });

    // Добавляем чаты в папку (только те, в которых пользователь является участником)
    const userChats = await prisma.chatMember.findMany({
      where: {
        userId,
        chatId: {
          in: link.folder.chats.map(c => c.id),
        },
      },
      select: { chatId: true },
    });

    if (userChats.length > 0) {
      await prisma.chatFolder.update({
        where: { id: newFolder.id },
        data: {
          chats: {
            connect: userChats.map(uc => ({ id: uc.chatId })),
          },
        },
      });
    }

    // Увеличиваем счётчик использований
    await prisma.sharedFolderLink.update({
      where: { id: link.id },
      data: {
        usedCount: { increment: 1 },
      },
    });

    // Получаем обновлённую папку
    const updatedFolder = await prisma.chatFolder.findUnique({
      where: { id: newFolder.id },
      include: {
        chats: true,
      },
    });

    res.json({
      folder: updatedFolder,
      addedChats: userChats.length,
      totalChats: link.folder.chats.length,
    });
  } catch (error) {
    console.error('Ошибка добавления папки:', error);
    res.status(500).json({ error: 'Ошибка добавления папки' });
  }
});

export default router;
