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
    await prisma.sharedFolderLink.create({
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

// ─── DRAG-N-DROP REORDER ──────────────────────────────────────────────

/**
 * PUT /api/folders/reorder - Bulk reorder folders (drag-n-drop)
 */
router.put('/reorder/bulk', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { orders } = req.body; // [{ id: string, order: number }]

    if (!orders || !Array.isArray(orders)) {
      res.status(400).json({ error: 'orders array required' });
      return;
    }

    // Verify all folders belong to user
    const folderIds = orders.map((o: any) => o.id);
    const existing = await prisma.chatFolder.findMany({
      where: { id: { in: folderIds }, userId },
      select: { id: true },
    });

    if (existing.length !== folderIds.length) {
      res.status(403).json({ error: 'Some folders not found or not yours' });
      return;
    }

    // Update orders in transaction
    await prisma.$transaction(
      orders.map((o: any) =>
        prisma.chatFolder.update({
          where: { id: o.id },
          data: { order: o.order },
        })
      )
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Reorder folders error:', error);
    res.status(500).json({ error: 'Ошибка переупорядочивания' });
  }
});

// ─── AUTO-FOLDERS ─────────────────────────────────────────────────────

/**
 * POST /api/folders/rules - Create an auto-folder rule
 */
router.post('/:id/rules', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const folderId = String(req.params.id);
    const { type, value } = req.body;

    const validTypes = ['chat_type', 'keyword', 'sender', 'media_type', 'unread'];
    if (!type || !validTypes.includes(type)) {
      res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
      return;
    }
    if (!value) {
      res.status(400).json({ error: 'value required' });
      return;
    }

    const folder = await prisma.chatFolder.findFirst({ where: { id: folderId, userId } });
    if (!folder) {
      res.status(404).json({ error: 'Папка не найдена' });
      return;
    }

    const rule = await prisma.folderRule.create({
      data: { folderId, userId, type, value },
    });

    res.json(rule);
  } catch (error) {
    console.error('Create folder rule error:', error);
    res.status(500).json({ error: 'Ошибка создания правила' });
  }
});

/**
 * GET /api/folders/rules - Get all rules for user
 */
router.get('/rules/all', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const rules = await prisma.folderRule.findMany({
      where: { userId },
      include: { folder: { select: { id: true, name: true } } },
    });
    res.json(rules);
  } catch (error) {
    console.error('Get folder rules error:', error);
    res.status(500).json({ error: 'Ошибка получения правил' });
  }
});

/**
 * DELETE /api/folders/rules/:ruleId - Delete a rule
 */
router.delete('/rules/:ruleId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const ruleId = String(req.params.ruleId);

    const rule = await prisma.folderRule.findFirst({ where: { id: ruleId, userId } });
    if (!rule) return res.status(404).json({ error: 'Правило не найдено' });

    await prisma.folderRule.delete({ where: { id: ruleId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete folder rule error:', error);
    res.status(500).json({ error: 'Ошибка удаления правила' });
  }
});

/**
 * POST /api/folders/auto-apply - Apply auto-folder rules to chats
 */
router.post('/auto-apply', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const rules = await prisma.folderRule.findMany({
      where: { userId, isActive: true },
    });

    if (rules.length === 0) {
      return res.json({ applied: 0, message: 'No rules configured' });
    }

    // Get all user's chat memberships
    const memberships = await prisma.chatMember.findMany({
      where: { userId },
      select: { chatId: true },
    });
    const chatIds = memberships.map(m => m.chatId);

    let applied = 0;

    for (const rule of rules) {
      let matchingChatIds: string[] = [];

      switch (rule.type) {
        case 'chat_type': {
          // "group", "channel", "personal"
          const chats = await prisma.chat.findMany({
            where: { id: { in: chatIds }, type: rule.value },
            select: { id: true },
          });
          matchingChatIds = chats.map(c => c.id);
          break;
        }
        case 'keyword': {
          // Match chat name containing keyword
          const chats = await prisma.chat.findMany({
            where: { id: { in: chatIds }, name: { contains: rule.value } },
            select: { id: true },
          });
          matchingChatIds = chats.map(c => c.id);
          break;
        }
        case 'sender': {
          // Match chats where a specific user sent last message
          const chats = await prisma.chat.findMany({
            where: {
              id: { in: chatIds },
              members: { some: { userId: rule.value } },
            },
            select: { id: true },
          });
          matchingChatIds = chats.map(c => c.id);
          break;
        }
        case 'unread': {
          // Match chats with unread messages
          const chats = await prisma.chat.findMany({
            where: {
              id: { in: chatIds },
              members: { some: { userId, clearedAt: null } },
            },
            select: { id: true },
          });
          matchingChatIds = chats.map(c => c.id);
          break;
        }
      }

      // Connect matching chats to folder
      if (matchingChatIds.length > 0) {
        await prisma.chatFolder.update({
          where: { id: rule.folderId },
          data: {
            chats: {
              connect: matchingChatIds.map(id => ({ id })),
            },
          },
        });
        applied += matchingChatIds.length;
      }
    }

    res.json({ applied });
  } catch (error) {
    console.error('Auto-apply rules error:', error);
    res.status(500).json({ error: 'Ошибка применения правил' });
  }
});

// ─── FOLDER SORT ORDER (for drag-n-drop persistence) ──────────────────

/**
 * PUT /api/folders/sort-order - Save folder sort order
 */
router.put('/sort-order', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { orders } = req.body; // [{ folderId: string, sortOrder: number }]

    if (!orders || !Array.isArray(orders)) {
      res.status(400).json({ error: 'orders array required' });
      return;
    }

    await prisma.$transaction(
      orders.map((o: any) =>
        prisma.folderSortOrder.upsert({
          where: { userId_folderId: { userId, folderId: o.folderId } },
          create: { userId, folderId: o.folderId, sortOrder: o.sortOrder },
          update: { sortOrder: o.sortOrder },
        })
      )
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Save sort order error:', error);
    res.status(500).json({ error: 'Ошибка сохранения порядка' });
  }
});

/**
 * GET /api/folders/sort-order - Get folder sort order
 */
router.get('/sort-order', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const orders = await prisma.folderSortOrder.findMany({
      where: { userId },
      orderBy: { sortOrder: 'asc' },
    });
    res.json(orders);
  } catch (error) {
    console.error('Get sort order error:', error);
    res.status(500).json({ error: 'Ошибка получения порядка' });
  }
});

export default router;
