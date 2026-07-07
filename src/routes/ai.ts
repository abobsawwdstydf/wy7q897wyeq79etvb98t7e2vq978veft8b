import { Router, Response as ExpressResponse } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { prisma } from '../db';
import { config } from '../config';

const router = Router();

// ============================================
// NEXO AI — через Cloudflare Worker прокси
// ============================================
//
// Все AI-запросы идут через единый Cloudflare Worker:
//   POST {AI_PROXY_URL}/chat        — JSON ответ
//   POST {AI_PROXY_URL}/chat/stream — SSE стриминг
//   POST {AI_PROXY_URL}/generate-image — генерация изображений
//
// API-ключи хранятся в Worker secrets, НЕ на сервере.

const PROXY_URL = config.aiProxyUrl;
const PROXY_SECRET = config.aiProxySecret;

const SYSTEM_PROMPT = `Ты — Нексо AI, умный и дружелюбный ассистент мессенджера Нексо.

Правила:
- Отвечай кратко и по делу
- Если пользователь пишет "ну ты понял" или подобное — отвечай с юмором
- Пиши на русском языке, если пользователь не указал другой язык
- Используй markdown для форматирования (жирный, курсив, списки, код)
- Для блоков кода используй тройные кавычки с указанием языка`;

// ---------- Проксирование запросов ----------

async function proxyChat(messages: any[], stream: boolean): Promise<Response> {
  const url = stream ? `${PROXY_URL}/chat/auto/stream` : `${PROXY_URL}/chat/auto`;
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Proxy-Secret': PROXY_SECRET,
    },
    body: JSON.stringify({
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      stream,
    }),
    signal: AbortSignal.timeout(stream ? 60000 : 45000),
  });
}

async function proxyGenerateImage(prompt: string): Promise<Response> {
  return fetch(`${PROXY_URL}/generate-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Proxy-Secret': PROXY_SECRET,
    },
    body: JSON.stringify({ prompt }),
    signal: AbortSignal.timeout(60000),
  });
}

// ---------- SSE стриминг ----------

async function consumeSSEStream(fetchResponse: globalThis.Response, res: ExpressResponse): Promise<boolean> {
  const reader = fetchResponse.body?.getReader();
  if (!reader) return false;

  const decoder = new TextDecoder();
  let fullText = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const json = JSON.parse(line.slice(6));
            if (json.token) {
              fullText += json.token;
              res.write(`data: ${JSON.stringify({ token: json.token })}\n\n`);
              if (typeof (res as any).flush === 'function') (res as any).flush();
            }
            if (json.done) {
              res.write(`data: ${JSON.stringify({ done: true, text: fullText })}\n\n`);
              if (typeof (res as any).flush === 'function') (res as any).flush();
              return true;
            }
            if (json.error) {
              res.write(`data: ${JSON.stringify({ error: json.error })}\n\n`);
              return false;
            }
          } catch { /* skip parse errors */ }
        }
      }
    }

    res.write(`data: ${JSON.stringify({ done: true, text: fullText })}\n\n`);
    if (typeof (res as any).flush === 'function') (res as any).flush();
    return true;
  } catch {
    return false;
  }
}

// ---------- Нон-стрим запрос ----------

async function proxyChatJSON(messages: any[]): Promise<string> {
  const response = await proxyChat(messages, false);

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`AI proxy ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json() as any;
  if (data.error) throw new Error(data.error);
  return data.text || '';
}

// ---------- Очередь ----------

interface QueuedRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  messages: any[];
  stream: boolean;
  res?: ExpressResponse;
  timestamp: number;
}

const requestQueue: QueuedRequest[] = [];
let isProcessingQueue = false;
const MAX_QUEUE_SIZE = 50;
const REQUEST_TIMEOUT = 45000;

async function processQueue() {
  if (isProcessingQueue || requestQueue.length === 0) return;
  isProcessingQueue = true;

  while (requestQueue.length > 0) {
    const req = requestQueue.shift();
    if (!req) continue;

    if (Date.now() - req.timestamp > REQUEST_TIMEOUT) {
      req.reject(new Error('Request timeout'));
      continue;
    }

    try {
      if (req.stream && req.res) {
        const response = await proxyChat(req.messages, true);
        if (response.ok) {
          const ok = await consumeSSEStream(response, req.res);
          if (ok) { req.res.end(); req.resolve(true); }
          else req.reject(new Error('Stream failed'));
        } else {
          req.reject(new Error('AI proxy error'));
        }
      } else {
        const text = await proxyChatJSON(req.messages);
        req.resolve({ text });
      }
    } catch (error) {
      req.reject(error as Error);
    }
  }

  isProcessingQueue = false;
}

// ---------- Определение простого запроса ----------

function isSimpleQuery(messages: any[]): boolean {
  const lastMsg = messages[messages.length - 1]?.content || '';
  return lastMsg.length < 100;
}

// ============================================
// ROUTES
// ============================================

/**
 * POST /api/ai/chat — обычный JSON ответ
 */
router.post('/chat', authenticateToken, async (req: AuthRequest, res: ExpressResponse) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'Сообщения обязательны' });
    return;
  }

  try {
    const text = await proxyChatJSON(messages);
    res.json({ text });
  } catch (error: any) {
    if (requestQueue.length < MAX_QUEUE_SIZE) {
      const promise = new Promise<any>((resolve, reject) => {
        requestQueue.push({ resolve, reject, messages, stream: false, timestamp: Date.now() });
      });
      processQueue();
      try { const result = await promise; res.json(result); }
      catch { res.status(503).json({ error: 'Нексо AI перегружен, попробуй через несколько секунд' }); }
    } else {
      res.status(503).json({ error: 'Нексо AI перегружен, попробуй позже' });
    }
  }
});

/**
 * POST /api/ai/chat/stream — SSE стриминг
 */
router.post('/chat/stream', authenticateToken, async (req: AuthRequest, res: ExpressResponse) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'Сообщения обязательны' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  try {
    const response = await proxyChat(messages, true);
    if (response.ok) {
      const ok = await consumeSSEStream(response, res);
      if (ok) { res.end(); return; }
    }
  } catch { /* try queue */ }

  if (requestQueue.length < MAX_QUEUE_SIZE) {
    const promise = new Promise<any>((resolve, reject) => {
      requestQueue.push({ resolve, reject, messages, stream: true, res, timestamp: Date.now() });
    });
    processQueue();
    try { await promise; }
    catch { res.write(`data: ${JSON.stringify({ error: 'Нексо AI перегружен' })}\n\n`); }
  } else {
    res.write(`data: ${JSON.stringify({ error: 'Нексо AI перегружен, попробуй позже' })}\n\n`);
  }

  res.end();
});

/**
 * GET /api/ai/status
 */
router.get('/status', authenticateToken, (_req: AuthRequest, res: ExpressResponse) => {
  res.json({
    proxy: !!PROXY_URL,
    proxyUrl: PROXY_URL ? 'configured' : 'not configured',
    queue: requestQueue.length,
  });
});

/**
 * POST /api/ai/context — AI с контекстом из сообщения
 */
router.post('/context', authenticateToken, async (req: AuthRequest, res: ExpressResponse) => {
  const { messageId, chatId, question } = req.body;

  if (!messageId || !chatId) {
    res.status(400).json({ error: 'messageId и chatId обязательны' });
    return;
  }

  try {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: { select: { displayName: true, username: true } },
        replyTo: { select: { content: true, sender: { select: { displayName: true } } } },
      },
    });

    if (!message) {
      res.status(404).json({ error: 'Сообщение не найдено' });
      return;
    }

    const contextMessages = await prisma.message.findMany({
      where: { chatId, createdAt: { lte: message.createdAt } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { sender: { select: { displayName: true, username: true } } },
    });

    const context = contextMessages.reverse().map(m =>
      `${m.sender.displayName || m.sender.username}: ${m.content || '[медиа]'}`
    ).join('\n');

    const aiMessages = [{
      role: 'user',
      content: `Контекст переписки:\n${context}\n\nВопрос пользователя: ${question || 'Проанализируй это сообщение и дай совет'}`,
    }];

    const text = await proxyChatJSON(aiMessages);
    res.json({ text, context });
  } catch (error: any) {
    console.error('Ошибка AI context:', error);
    res.status(500).json({ error: error.message || 'Ошибка обработки контекста' });
  }
});

/**
 * POST /api/ai/suggestions — Умные предложения ответов
 */
router.post('/suggestions', authenticateToken, async (req: AuthRequest, res: ExpressResponse) => {
  const { chatId, lastMessage } = req.body;

  if (!chatId || !lastMessage) {
    res.status(400).json({ error: 'chatId и lastMessage обязательны' });
    return;
  }

  try {
    const aiMessages = [{
      role: 'user',
      content: `Последнее сообщение: "${lastMessage}"

Предложи 3 варианта ответа на это сообщение. Ответы должны быть:
1. Короткими (до 50 символов)
2. Естественными и дружелюбными
3. Разными по тону (формальный, дружеский, эмоциональный)

Формат ответа - только 3 строки, каждая с одним вариантом ответа, без нумерации и пояснений.`,
    }];

    const text = await proxyChatJSON(aiMessages);
    const suggestions = text.split('\n').filter(s => s.trim()).slice(0, 3);
    res.json({ suggestions });
  } catch (error: any) {
    console.error('Ошибка AI suggestions:', error);
    res.status(500).json({ error: error.message || 'Ошибка генерации предложений' });
  }
});

/**
 * POST /api/ai/autocomplete — Автодополнение текста
 */
router.post('/autocomplete', authenticateToken, async (req: AuthRequest, res: ExpressResponse) => {
  const { text } = req.body;

  if (!text || text.length < 3) {
    res.json({ completion: '' });
    return;
  }

  try {
    const aiMessages = [{
      role: 'user',
      content: `Продолжи это предложение естественным образом (максимум 10 слов): "${text}"

Верни ТОЛЬКО продолжение, без повтора исходного текста и без пояснений.`,
    }];

    const completion = await proxyChatJSON(aiMessages);
    res.json({ completion: completion.trim() });
  } catch (error: any) {
    console.error('Ошибка AI autocomplete:', error);
    res.json({ completion: '' });
  }
});

/**
 * POST /api/ai/grammar — Проверка и исправление грамматики
 */
router.post('/grammar', authenticateToken, async (req: AuthRequest, res: ExpressResponse) => {
  const { text } = req.body;

  if (!text) {
    res.status(400).json({ error: 'text обязателен' });
    return;
  }

  try {
    const aiMessages = [{
      role: 'user',
      content: `Исправь грамматические и орфографические ошибки в этом тексте: "${text}"

Верни ТОЛЬКО исправленный текст, без пояснений. Если ошибок нет, верни исходный текст.`,
    }];

    const corrected = await proxyChatJSON(aiMessages);
    const hasChanges = corrected.trim() !== text.trim();
    res.json({ corrected: corrected.trim(), hasChanges, original: text });
  } catch (error: any) {
    console.error('Ошибка AI grammar:', error);
    res.status(500).json({ error: error.message || 'Ошибка проверки грамматики' });
  }
});

/**
 * POST /api/ai/generate-image — Генерация изображений
 */
router.post('/generate-image', authenticateToken, async (req: AuthRequest, res: ExpressResponse) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'prompt обязателен' });
    return;
  }

  const cleanPrompt = prompt.trim().slice(0, 500);

  try {
    const response = await proxyGenerateImage(cleanPrompt);
    const data = await response.json() as any;

    if (!response.ok || data.error) {
      return res.status(503).json({ error: data.error || 'Ошибка генерации изображения' });
    }

    res.json(data);
  } catch (error: any) {
    console.error('[AI Image] Error:', error);
    res.status(503).json({ error: 'Сервис генерации изображений временно недоступен' });
  }
});

/**
 * POST /api/ai/chat-summary — Краткое содержание чата
 */
router.post('/chat-summary', authenticateToken, async (req: AuthRequest, res: ExpressResponse) => {
  const { chatId, limit = 50 } = req.body;

  if (!chatId) {
    res.status(400).json({ error: 'chatId обязателен' });
    return;
  }

  try {
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member) {
      res.status(403).json({ error: 'Нет доступа к чату' });
      return;
    }

    const messages = await prisma.message.findMany({
      where: { chatId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      include: { sender: { select: { displayName: true, username: true } } },
    });

    if (messages.length === 0) {
      res.json({ summary: 'В чате пока нет сообщений.' });
      return;
    }

    const context = messages.reverse().map(m =>
      `${m.sender.displayName || m.sender.username}: ${m.content || '[медиа]'}`
    ).join('\n');

    const aiMessages = [{
      role: 'user',
      content: `Сделай краткое резюме этой переписки (3-5 предложений). Выдели ключевые темы, решения и важные моменты. Пиши на русском языке.

Переписка:\n${context}`,
    }];

    const summary = await proxyChatJSON(aiMessages);

    await prisma.chatSummary.create({
      data: {
        chatId,
        userId: req.userId!,
        summary,
        messageCount: messages.length,
        startDate: messages[0].createdAt,
        endDate: messages[messages.length - 1].createdAt,
      },
    });

    res.json({ summary, messageCount: messages.length });
  } catch (error: any) {
    console.error('Ошибка AI chat-summary:', error);
    res.status(500).json({ error: error.message || 'Ошибка генерации резюме' });
  }
});

/**
 * GET /api/ai/summaries/:chatId — Получить все резюме чата
 */
router.get('/summaries/:chatId', authenticateToken, async (req: AuthRequest, res: ExpressResponse) => {
  const chatId = String(req.params.chatId);
  const userId = req.userId!;

  try {
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });

    if (!member) {
      res.status(403).json({ error: 'Нет доступа к чату' });
      return;
    }

    const summaries = await prisma.chatSummary.findMany({
      where: { chatId, userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    res.json(summaries);
  } catch (error: any) {
    console.error('Ошибка получения резюме:', error);
    res.status(500).json({ error: error.message || 'Ошибка получения резюме' });
  }
});

/**
 * POST /api/ai/download-image — Скачать изображение через сервер (обход CORS)
 */
router.post('/download-image', authenticateToken, async (req: AuthRequest, res: ExpressResponse) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'url обязателен' });
    return;
  }

  const allowedDomains = [
    'fal.run', 'fal.media', 'storage.googleapis.com',
    'image.pollinations.ai', 'api-inference.huggingface.co',
  ];

  let parsedUrl: URL;
  try { parsedUrl = new URL(url); }
  catch { return res.status(400).json({ error: 'Некорректный URL' }); }

  if (!allowedDomains.some(d => parsedUrl.hostname.endsWith(d))) {
    return res.status(403).json({ error: 'Домен не разрешён' });
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Nexo-App/1.0' },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return res.status(502).json({ error: `Ошибка загрузки: ${response.status}` });
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    res.json({ dataUrl: `data:${contentType};base64,${base64}`, contentType });
  } catch (error: any) {
    console.error('[AI] download-image error:', error);
    res.status(500).json({ error: 'Не удалось скачать изображение' });
  }
});

export default router;
