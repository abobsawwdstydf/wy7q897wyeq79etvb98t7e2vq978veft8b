import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db';
import { config } from '../config';
import { SENDER_SELECT } from '../shared';
import { getSocket } from '../socket';

const router = Router();

// Rate limit for bot registration
const botRegisterLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 bots per hour per IP
  message: { error: 'Слишком много регистраций ботов. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
});

function sanitizeBotField(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/[<>"'&]/g, '')
    .trim()
    .slice(0, maxLen);
}

function isValidBotUsername(username: string): boolean {
  return /^[a-z][a-z0-9_]{2,31}$/.test(username);
}

// ═══════════════════════════════════════════════════════════════════
// BOT TOKEN AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════

async function authenticateBot(req: Request, res: Response, next: Function) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bot ') ? authHeader.slice(4) : null;

  if (!token) {
    return res.status(401).json({ error: 'Bot token required. Use Authorization: Bot <token>' });
  }

  const bot = await prisma.bot.findUnique({ where: { token } });
  if (!bot || !bot.isActive) {
    return res.status(401).json({ error: 'Invalid or inactive bot token' });
  }

  (req as any).botId = bot.id;
  (req as any).botUserId = bot.userId;
  next();
}

// ═══════════════════════════════════════════════════════════════════
// BOT REGISTRATION — Create a new bot
// ═══════════════════════════════════════════════════════════════════

router.post('/register', botRegisterLimiter, async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers['authorization'];
    const userToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!userToken) return res.status(401).json({ error: 'User auth required' });

    const jwt = await import('jsonwebtoken');
    let decoded: { userId: string; type?: string };
    try {
      decoded = jwt.default.verify(userToken, config.jwtSecret) as { userId: string; type?: string };
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (decoded.type && decoded.type !== 'access') {
      return res.status(401).json({ error: 'Недействительный тип токена' });
    }
    const userId = decoded.userId;

    const { username, displayName, description } = req.body;
    const cleanUsername = sanitizeBotField(username, 32);
    const cleanDisplayName = sanitizeBotField(displayName, 64);
    const cleanDescription = sanitizeBotField(description, 500);

    if (!cleanUsername || !cleanDisplayName) {
      return res.status(400).json({ error: 'username и displayName обязательны' });
    }
    if (!isValidBotUsername(cleanUsername)) {
      return res.status(400).json({ error: 'username: 3-32 символа, латиница, цифры, _. Должен начинаться с буквы.' });
    }

    // Limit bots per user
    const userBotCount = await prisma.bot.count({ where: { userId } });
    if (userBotCount >= 10) {
      return res.status(400).json({ error: 'Максимум 10 ботов на пользователя' });
    }

    const existingBot = await prisma.bot.findFirst({ where: { username: cleanUsername } });
    if (existingBot) return res.status(400).json({ error: 'Bot username занят' });

    const token = 'bot_' + require('crypto').randomBytes(32).toString('hex');

    const bot = await prisma.bot.create({
      data: {
        username: cleanUsername,
        displayName: cleanDisplayName,
        description: cleanDescription || null,
        token,
        userId,
        isActive: true,
      },
    });

    res.json({ bot: { id: bot.id, username: bot.username, displayName: bot.displayName, token } });
  } catch (err: any) {
    if (err.name === 'JsonWebTokenError') return res.status(401).json({ error: 'Invalid token' });
    console.error('[Bot API] Register error:', err);
    res.status(500).json({ error: 'Ошибка регистрации бота' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET BOT INFO
// ═══════════════════════════════════════════════════════════════════

router.get('/me', authenticateBot, async (req: Request, res: Response) => {
  try {
    const botId = (req as any).botId;
    const bot = await prisma.bot.findUnique({
      where: { id: botId },
      select: { id: true, username: true, displayName: true, description: true, isActive: true, createdAt: true },
    });
    res.json(bot);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// SEND MESSAGE via bot
// ═══════════════════════════════════════════════════════════════════

router.post('/sendMessage', authenticateBot, async (req: Request, res: Response) => {
  try {
    const botUserId = (req as any).botUserId;
    const { chatId, content, replyToId } = req.body;
    if (!chatId || !content) return res.status(400).json({ error: 'chatId и content обязательны' });

    // Sanitize content: strip HTML, limit length
    const cleanContent = typeof content === 'string'
      ? content.replace(/<[^>]*>/g, '').trim().slice(0, 10000)
      : '';
    if (!cleanContent) return res.status(400).json({ error: 'Пустое содержимое' });

    // Validate chatId format (should be a cuid-like string)
    if (typeof chatId !== 'string' || !/^[a-z0-9]{25,30}$/.test(chatId)) {
      return res.status(400).json({ error: 'Неверный формат chatId' });
    }
    if (replyToId && (typeof replyToId !== 'string' || !/^[a-z0-9]{25,30}$/.test(replyToId))) {
      return res.status(400).json({ error: 'Неверный формат replyToId' });
    }

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: botUserId } },
    });
    if (!member) return res.status(403).json({ error: 'Bot not a member of this chat' });

    const message = await prisma.message.create({
      data: {
        chatId,
        senderId: botUserId,
        content: cleanContent,
        replyToId: replyToId || null,
        type: 'text',
      },
      include: {
        sender: { select: SENDER_SELECT },
        media: true,
        reactions: true,
        readBy: true,
      },
    });

    const io = getSocket();
    if (io) io.to(`chat:${chatId}`).emit('new_message', message);

    res.json(message);
  } catch (err) {
    console.error('[Bot API] sendMessage error:', err);
    res.status(500).json({ error: 'Ошибка отправки' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET UPDATES (polling) — read messages from chats where bot is member
// ═══════════════════════════════════════════════════════════════════

router.get('/getUpdates', authenticateBot, async (req: Request, res: Response) => {
  try {
    const botUserId = (req as any).botUserId;
    const { offset = '0', limit = '100' } = req.query;

    const memberships = await prisma.chatMember.findMany({
      where: { userId: botUserId },
      select: { chatId: true },
    });
    const chatIds = memberships.map(m => m.chatId);

    const messages = await prisma.message.findMany({
      where: {
        chatId: { in: chatIds },
        senderId: { not: botUserId },
        createdAt: { gt: new Date(Number(offset)) },
        isDeleted: false,
      },
      include: {
        sender: { select: SENDER_SELECT },
        chat: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: Math.min(Number(limit), 200),
    });

    res.json({ messages, offset: messages.length > 0 ? new Date(messages[messages.length - 1].createdAt).getTime() : Number(offset) });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения обновлений' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET CHATS — list chats where bot is member
// ═══════════════════════════════════════════════════════════════════

router.get('/getChats', authenticateBot, async (req: Request, res: Response) => {
  try {
    const botUserId = (req as any).botUserId;
    const memberships = await prisma.chatMember.findMany({
      where: { userId: botUserId },
      include: {
        chat: {
          select: { id: true, name: true, type: true, username: true, avatar: true, subscribersCount: true },
        },
      },
    });
    res.json({ chats: memberships.map(m => ({ ...m.chat, role: m.role })) });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

export default router;
