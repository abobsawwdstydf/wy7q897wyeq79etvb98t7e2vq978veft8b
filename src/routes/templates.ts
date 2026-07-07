import { Router } from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Get all templates
router.get('/', async (req: AuthRequest, res) => {
  try {
    const templates = await prisma.messageTemplate.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: 'desc' },
    });

    res.json(templates);
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create template
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { name, content } = req.body;

    if (!name || !content) {
      res.status(400).json({ error: 'Name and content required' });
      return;
    }

    const template = await prisma.messageTemplate.create({
      data: {
        userId: req.userId!,
        name,
        content,
      },
    });

    res.json(template);
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update template
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const { name, content } = req.body;

    const template = await prisma.messageTemplate.update({
      where: { id },
      data: { name, content },
    });

    res.json(template);
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete template
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);

    await prisma.messageTemplate.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
