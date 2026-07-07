import { Router } from 'express';
import { prisma } from '../db';
import bcrypt from 'bcryptjs';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Create secret chat
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const { userId, password, selfDestructTimer } = req.body;
    const currentUserId = (req as AuthRequest).userId!;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Check if chat already exists
    const existingChat = await prisma.chat.findFirst({
      where: {
        type: 'personal',
        members: {
          every: {
            userId: {
              in: [currentUserId, userId]
            }
          }
        }
      }
    });

    if (existingChat && existingChat.isSecret) {
      return res.status(400).json({ error: 'Secret chat already exists' });
    }

    // Hash password if provided
    let hashedPassword = null;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    // Create secret chat
    const chat = await prisma.chat.create({
      data: {
        type: 'personal',
        isSecret: true,
        isE2E: true,
        secretPassword: hashedPassword,
        members: {
          create: [
            { userId: currentUserId },
            { userId }
          ]
        }
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                isOnline: true,
                lastSeen: true
              }
            }
          }
        }
      }
    });

    res.json({ chat, selfDestructTimer });
  } catch (error) {
    console.error('Error creating secret chat:', error);
    res.status(500).json({ error: 'Failed to create secret chat' });
  }
});

// Verify secret chat password
router.post('/verify', authenticateToken, async (req, res) => {
  try {
    const { chatId, password } = req.body;

    if (!chatId || !password) {
      return res.status(400).json({ error: 'Chat ID and password are required' });
    }

    const chat = await prisma.chat.findUnique({
      where: { id: chatId }
    });

    if (!chat || !chat.isSecret || !chat.secretPassword) {
      return res.status(404).json({ error: 'Secret chat not found' });
    }

    const isValid = await bcrypt.compare(password, chat.secretPassword);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error verifying password:', error);
    res.status(500).json({ error: 'Failed to verify password' });
  }
});

// Set self-destruct timer for message
router.post('/message/self-destruct', authenticateToken, async (req, res) => {
  try {
    const { messageId, timer } = req.body;
    const currentUserId = (req as AuthRequest).userId!;

    if (!messageId || !timer) {
      return res.status(400).json({ error: 'Message ID and timer are required' });
    }

    // Verify message belongs to user
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: { chat: true }
    });

    if (!message || message.senderId !== currentUserId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (!message.chat.isSecret) {
      return res.status(400).json({ error: 'Not a secret chat' });
    }

    // Calculate self-destruct time
    const selfDestructAt = new Date(Date.now() + timer * 1000);

    // Update message
    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: {
        selfDestructTimer: timer,
        selfDestructAt
      }
    });

    res.json({ message: updatedMessage });
  } catch (error) {
    console.error('Error setting self-destruct timer:', error);
    res.status(500).json({ error: 'Failed to set self-destruct timer' });
  }
});

// Delete secret chat
router.delete('/:chatId', authenticateToken, async (req, res) => {
  try {
    const chatId = String(req.params.chatId);
    const currentUserId = (req as AuthRequest).userId!;

    // Verify user is member of chat
    const member = await prisma.chatMember.findFirst({
      where: {
        chatId,
        userId: currentUserId
      }
    });

    if (!member) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Delete all messages in chat
    await prisma.message.deleteMany({
      where: { chatId }
    });

    // Delete chat
    await prisma.chat.delete({
      where: { id: chatId }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting secret chat:', error);
    res.status(500).json({ error: 'Failed to delete secret chat' });
  }
});

// Get secret chat settings
router.get('/:chatId/settings', authenticateToken, async (req, res) => {
  try {
    const chatId = String(req.params.chatId);
    const currentUserId = (req as AuthRequest).userId!;

    // Verify user is member of chat
    const member = await prisma.chatMember.findFirst({
      where: {
        chatId,
        userId: currentUserId
      }
    });

    if (!member) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        id: true,
        isSecret: true,
        isE2E: true,
        secretPassword: true
      }
    });

    if (!chat || !chat.isSecret) {
      return res.status(404).json({ error: 'Secret chat not found' });
    }

    res.json({
      isSecret: chat.isSecret,
      isE2E: chat.isE2E,
      hasPassword: !!chat.secretPassword
    });
  } catch (error) {
    console.error('Error getting secret chat settings:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// ============================================
// СКРЫТЫЕ ЧАТЫ (Hidden chats with password)
// ============================================

// Установить пароль на обычный чат (скрытый чат)
router.post('/hidden/set-password', authenticateToken, async (req, res) => {
  try {
    const { chatId, password } = req.body;
    const currentUserId = (req as AuthRequest).userId!;

    if (!chatId || !password) {
      return res.status(400).json({ error: 'chatId и password обязательны' });
    }

    // Проверяем что пользователь является членом чата
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: currentUserId } },
    });

    if (!member) {
      return res.status(403).json({ error: 'Нет доступа к чату' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.chat.update({
      where: { id: chatId },
      data: {
        isSecret: true,
        secretPassword: hashedPassword,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error setting hidden chat password:', error);
    res.status(500).json({ error: 'Ошибка установки пароля' });
  }
});

// Проверить пароль скрытого чата
router.post('/hidden/verify-password', authenticateToken, async (req, res) => {
  try {
    const { chatId, password } = req.body;
    const currentUserId = (req as AuthRequest).userId!;

    if (!chatId || !password) {
      return res.status(400).json({ error: 'chatId и password обязательны' });
    }

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: currentUserId } },
    });

    if (!member) {
      return res.status(403).json({ error: 'Нет доступа к чату' });
    }

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: { secretPassword: true, isSecret: true },
    });

    if (!chat || !chat.secretPassword) {
      return res.status(404).json({ error: 'Пароль не установлен' });
    }

    const isValid = await bcrypt.compare(password, chat.secretPassword);

    if (!isValid) {
      return res.status(401).json({ error: 'Неверный пароль' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error verifying hidden chat password:', error);
    res.status(500).json({ error: 'Ошибка проверки пароля' });
  }
});

// Снять пароль со скрытого чата
router.post('/hidden/remove-password', authenticateToken, async (req, res) => {
  try {
    const { chatId, password } = req.body;
    const currentUserId = (req as AuthRequest).userId!;

    if (!chatId || !password) {
      return res.status(400).json({ error: 'chatId и password обязательны' });
    }

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: currentUserId } },
    });

    if (!member) {
      return res.status(403).json({ error: 'Нет доступа к чату' });
    }

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: { secretPassword: true },
    });

    if (!chat?.secretPassword) {
      return res.status(404).json({ error: 'Пароль не установлен' });
    }

    const isValid = await bcrypt.compare(password, chat.secretPassword);
    if (!isValid) {
      return res.status(401).json({ error: 'Неверный пароль' });
    }

    await prisma.chat.update({
      where: { id: chatId },
      data: { isSecret: false, secretPassword: null },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error removing hidden chat password:', error);
    res.status(500).json({ error: 'Ошибка снятия пароля' });
  }
});

// Report screenshot attempt
router.post('/:chatId/screenshot', authenticateToken, async (req, res) => {
  try {
    const chatId = String(req.params.chatId);
    const currentUserId = (req as AuthRequest).userId!;

    // Verify chat is secret
    const chat = await prisma.chat.findUnique({
      where: { id: chatId }
    });

    if (!chat || !chat.isSecret) {
      return res.status(400).json({ error: 'Not a secret chat' });
    }

    // Get other member
    const members = await prisma.chatMember.findMany({
      where: {
        chatId,
        userId: { not: currentUserId }
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true
          }
        }
      }
    });

    // Send notification to other member(s)
    // This would be handled by WebSocket in real implementation
    console.log(`Screenshot detected in secret chat ${chatId} by user ${currentUserId}`);

    res.json({ success: true, notified: members.length });
  } catch (error) {
    console.error('Error reporting screenshot:', error);
    res.status(500).json({ error: 'Failed to report screenshot' });
  }
});

export default router;
