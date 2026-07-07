import express from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';
import crypto from 'crypto';
import { URL } from 'url';

const router = express.Router();

// SECURITY FIX: Validate webhook URLs to prevent SSRF
function isWebhookUrlSafe(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    // Only allow HTTPS
    if (parsed.protocol !== 'https:') return false;
    // Block private/internal IP ranges
    const hostname = parsed.hostname;
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('169.254.') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Get all webhooks for a chat
router.get('/chat/:chatId', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.chatId);
    const userId = req.userId!;

    // Check if user is owner/admin of the chat
    const member = await prisma.chatMember.findFirst({
      where: {
        chatId,
        userId,
        role: { in: ['owner', 'admin'] }
      }
    });

    if (!member) {
      return res.status(403).json({ error: 'Только владельцы и админы могут управлять вебхуками' });
    }

    const webhooks = await prisma.webhook.findMany({
      where: { chatId },
      orderBy: { createdAt: 'desc' }
    });

    res.json(webhooks);
  } catch (error) {
    console.error('Error fetching webhooks:', error);
    res.status(500).json({ error: 'Ошибка получения вебхуков' });
  }
});

// Create webhook
router.post('/chat/:chatId', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.chatId);
    const { url, events } = req.body;
    const userId = req.userId!;

    // Check if user is owner/admin
    const member = await prisma.chatMember.findFirst({
      where: {
        chatId,
        userId,
        role: { in: ['owner', 'admin'] }
      }
    });

    if (!member) {
      return res.status(403).json({ error: 'Только владельцы и админы могут создавать вебхуки' });
    }

    // SECURITY FIX: Validate webhook URL to prevent SSRF
    if (!url || typeof url !== 'string' || !isWebhookUrlSafe(url)) {
      return res.status(400).json({ error: 'Недопустимый URL вебхука. Разрешены только HTTPS адреса.' });
    }

    // Generate secret for webhook verification
    const secret = crypto.randomBytes(32).toString('hex');

    const webhook = await prisma.webhook.create({
      data: {
        chatId,
        url,
        secret,
        events: JSON.stringify(events || ['message', 'member_join', 'member_leave']),
        isActive: true
      }
    });

    res.json(webhook);
  } catch (error) {
    console.error('Error creating webhook:', error);
    res.status(500).json({ error: 'Ошибка создания вебхука' });
  }
});

// Update webhook
router.put('/:webhookId', async (req: AuthRequest, res) => {
  try {
    const webhookId = String(req.params.webhookId);
    const { url, events, isActive } = req.body;
    const userId = req.userId!;

    // Get webhook and check permissions
    const webhook = await prisma.webhook.findUnique({
      where: { id: webhookId },
      include: {
        chat: {
          include: {
            members: {
              where: {
                userId,
                role: { in: ['owner', 'admin'] }
              }
            }
          }
        }
      }
    });

    if (!webhook || webhook.chat.members.length === 0) {
      return res.status(403).json({ error: 'Нет доступа к этому вебхуку' });
    }

    // SECURITY FIX: Validate new URL if provided
    if (url && typeof url === 'string' && !isWebhookUrlSafe(url)) {
      return res.status(400).json({ error: 'Недопустимый URL вебхука. Разрешены только HTTPS адреса.' });
    }

    const updated = await prisma.webhook.update({
      where: { id: webhookId },
      data: {
        ...(url && { url }),
        ...(events && { events: JSON.stringify(events) }),
        ...(typeof isActive === 'boolean' && { isActive })
      }
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating webhook:', error);
    res.status(500).json({ error: 'Ошибка обновления вебхука' });
  }
});

// Delete webhook
router.delete('/:webhookId', async (req: AuthRequest, res) => {
  try {
    const webhookId = String(req.params.webhookId);
    const userId = req.userId!;

    // Get webhook and check permissions
    const webhook = await prisma.webhook.findUnique({
      where: { id: webhookId },
      include: {
        chat: {
          include: {
            members: {
              where: {
                userId,
                role: { in: ['owner', 'admin'] }
              }
            }
          }
        }
      }
    });

    if (!webhook || webhook.chat.members.length === 0) {
      return res.status(403).json({ error: 'Нет доступа к этому вебхуку' });
    }

    await prisma.webhook.delete({
      where: { id: webhookId }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting webhook:', error);
    res.status(500).json({ error: 'Ошибка удаления вебхука' });
  }
});

export default router;
