import express from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();

// Get user privacy settings
router.get('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    let settings = await prisma.userPrivacySettings.findUnique({
      where: { userId }
    });

    // Create default settings if not exists
    if (!settings) {
      settings = await prisma.userPrivacySettings.create({
        data: {
          userId,
          hideOnline: false,
          hideTyping: false,
          hideReadReceipts: false,
          allowForwarding: true,
          allowScreenshots: true
        }
      });
    }

    res.json(settings);
  } catch (error) {
    console.error('Error fetching privacy settings:', error);
    res.status(500).json({ error: 'Ошибка получения настроек приватности' });
  }
});

// Update privacy settings
router.put('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { hideOnline, hideTyping, hideReadReceipts, allowForwarding, allowScreenshots } = req.body;

    const settings = await prisma.userPrivacySettings.upsert({
      where: { userId },
      create: {
        userId,
        hideOnline: hideOnline ?? false,
        hideTyping: hideTyping ?? false,
        hideReadReceipts: hideReadReceipts ?? false,
        allowForwarding: allowForwarding ?? true,
        allowScreenshots: allowScreenshots ?? true
      },
      update: {
        ...(typeof hideOnline === 'boolean' && { hideOnline }),
        ...(typeof hideTyping === 'boolean' && { hideTyping }),
        ...(typeof hideReadReceipts === 'boolean' && { hideReadReceipts }),
        ...(typeof allowForwarding === 'boolean' && { allowForwarding }),
        ...(typeof allowScreenshots === 'boolean' && { allowScreenshots })
      }
    });

    res.json(settings);
  } catch (error) {
    console.error('Error updating privacy settings:', error);
    res.status(500).json({ error: 'Ошибка обновления настроек приватности' });
  }
});

export default router;
