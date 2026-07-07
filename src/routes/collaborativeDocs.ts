import { Router } from 'express';
import { prisma } from '../db';
import { AuthRequest, authenticateToken } from '../middleware/auth';

const router = Router();

// Создать документ
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { chatId, title, content } = req.body;

    if (!chatId || !title) {
      return res.status(400).json({ error: 'chatId и title обязательны' });
    }

    const doc = await prisma.collaborativeDoc.create({
      data: {
        chatId,
        creatorId: userId,
        title,
        content: content || '',
        currentVersion: 1
      }
    });

    // Создаём первую версию
    await prisma.docVersion.create({
      data: {
        docId: doc.id,
        version: 1,
        content: content || '',
        authorId: userId
      }
    });

    res.json(doc);
  } catch (error: any) {
    console.error('Error creating doc:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить документы чата
router.get('/chat/:chatId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { chatId } = req.params;

    const docs = await prisma.collaborativeDoc.findMany({
      where: { chatId },
      orderBy: { updatedAt: 'desc' }
    });

    res.json(docs);
  } catch (error: any) {
    console.error('Error fetching docs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить документ
router.get('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const doc = await prisma.collaborativeDoc.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 10,
        },
        comments: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!doc) {
      return res.status(404).json({ error: 'Документ не найден' });
    }

    res.json(doc);
  } catch (error: any) {
    console.error('Error fetching doc:', error);
    res.status(500).json({ error: error.message });
  }
});

// Обновить документ
router.put('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { content, title } = req.body;

    const doc = await prisma.collaborativeDoc.findUnique({
      where: { id }
    });

    if (!doc) {
      return res.status(404).json({ error: 'Документ не найден' });
    }

    const newVersion = doc.currentVersion + 1;

    // Обновляем документ
    const updated = await prisma.collaborativeDoc.update({
      where: { id },
      data: {
        content,
        title: title || doc.title,
        currentVersion: newVersion,
        updatedAt: new Date()
      }
    });

    // Создаём новую версию
    await prisma.docVersion.create({
      data: {
        docId: id,
        version: newVersion,
        content,
        authorId: userId
      }
    });

    res.json(updated);
  } catch (error: any) {
    console.error('Error updating doc:', error);
    res.status(500).json({ error: error.message });
  }
});

// Добавить комментарий
router.post('/:id/comments', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { content, blockId, selection } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content обязателен' });
    }

    const comment = await prisma.docComment.create({
      data: {
        docId: id,
        authorId: userId,
        content,
        blockId,
        selection
      }
    });

    res.json(comment);
  } catch (error: any) {
    console.error('Error creating comment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Удалить комментарий
router.delete('/comments/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const comment = await prisma.docComment.findUnique({
      where: { id }
    });

    if (!comment) {
      return res.status(404).json({ error: 'Комментарий не найден' });
    }

    if (comment.authorId !== userId) {
      return res.status(403).json({ error: 'Нет прав' });
    }

    await prisma.docComment.delete({
      where: { id }
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Экспорт в PDF/DOCX (заглушка - требует библиотек)
router.get('/:id/export/:format', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id, format } = req.params;

    const doc = await prisma.collaborativeDoc.findUnique({
      where: { id }
    });

    if (!doc) {
      return res.status(404).json({ error: 'Документ не найден' });
    }

    // TODO: Реализовать экспорт через библиотеки (pdfkit, docx)
    res.json({
      message: 'Экспорт в разработке',
      format,
      title: doc.title,
      content: doc.content
    });
  } catch (error: any) {
    console.error('Error exporting doc:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
