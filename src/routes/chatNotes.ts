import { Router } from 'express';
import { prisma } from '../db';
import { AuthRequest, authenticateToken } from '../middleware/auth';

const router = Router();

// Получить заметки пользователя
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { chatId, search, tags } = req.query;

    const where: any = { userId };

    if (chatId) {
      where.chatId = chatId as string;
    }

    if (search) {
      where.OR = [
        { title: { contains: search as string } },
        { content: { contains: search as string } }
      ];
    }

    if (tags) {
      const tagArray = (tags as string).split(',');
      where.tags = {
        contains: tagArray.join(',')
      };
    }

    const notes = await prisma.chatNote.findMany({
      where,
      orderBy: { updatedAt: 'desc' }
    });

    res.json(notes);
  } catch (error: any) {
    console.error('Error fetching notes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Создать заметку
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { chatId, title, content, tags } = req.body;

    if (!chatId || !content) {
      return res.status(400).json({ error: 'chatId и content обязательны' });
    }

    const note = await prisma.chatNote.create({
      data: {
        userId,
        chatId,
        title: title || 'Без названия',
        content,
        tags: JSON.stringify(tags || [])
      }
    });

    res.json(note);
  } catch (error: any) {
    console.error('Error creating note:', error);
    res.status(500).json({ error: error.message });
  }
});

// Обновить заметку
router.put('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { title, content, tags } = req.body;

    const note = await prisma.chatNote.findUnique({
      where: { id }
    });

    if (!note) {
      return res.status(404).json({ error: 'Заметка не найдена' });
    }

    if (note.userId !== userId) {
      return res.status(403).json({ error: 'Нет прав' });
    }

    const updated = await prisma.chatNote.update({
      where: { id },
      data: {
        title,
        content,
        ...(tags !== undefined && { tags: JSON.stringify(tags) }),
        updatedAt: new Date()
      }
    });

    res.json(updated);
  } catch (error: any) {
    console.error('Error updating note:', error);
    res.status(500).json({ error: error.message });
  }
});

// Удалить заметку
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const note = await prisma.chatNote.findUnique({
      where: { id }
    });

    if (!note) {
      return res.status(404).json({ error: 'Заметка не найдена' });
    }

    if (note.userId !== userId) {
      return res.status(403).json({ error: 'Нет прав' });
    }

    await prisma.chatNote.delete({
      where: { id }
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить все теги пользователя
router.get('/tags', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const notes = await prisma.chatNote.findMany({
      where: { userId },
      select: { tags: true }
    });

    // Собираем уникальные теги (tags хранится как JSON-строка)
    const allTags: string[] = [];
    for (const n of notes) {
      try {
        const parsed = JSON.parse(n.tags);
        if (Array.isArray(parsed)) {
          allTags.push(...parsed);
        }
      } catch { /* empty */ }
    }
    const uniqueTags = [...new Set(allTags)];

    res.json(uniqueTags);
  } catch (error: any) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
