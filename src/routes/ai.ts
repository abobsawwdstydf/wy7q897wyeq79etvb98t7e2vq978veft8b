import { Router, Response as ExpressResponse } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { prisma } from '../db';

const router = Router();

// ============================================
// NEXO AI - Балансировка 4 сервисов
// ============================================
//
// Приоритет:
//   1. Cerebras  (80-90% запросов, до 1M токенов/день/аккаунт)
//   2. Groq      (резерв, стабильный)
//   3. SambaNova (глубокий резерв)
//   4. OpenRouter (последний рубеж, free модели)
//
// Модели:
//   Cerebras: qwen-3-235b-a22b-instruct-2507 (сложные), llama3.1-8b (простые)
//   Groq: llama-3.3-70b-versatile
//   SambaNova: Meta-Llama-3.1-70B-Instruct
//   OpenRouter: mistral-7b-instruct:free

// ---------- Загрузка ключей из env ----------

function loadKeys(prefix: string, count: number): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= count; i++) {
    const key = process.env[`${prefix}_${i}`];
    if (key) keys.push(key);
  }
  return keys;
}

const CEREBRAS_KEYS = loadKeys('CEREBRAS_KEY', 4);
const GROQ_KEYS = loadKeys('GROQ_KEY', 4);
const SAMBANOVA_KEYS = loadKeys('SAMBANOVA_KEY', 4);
const OPENROUTER_KEYS = loadKeys('OPENROUTER_KEY', 4);

// ---------- Состояние аккаунтов ----------

interface ProviderState {
  keys: string[];
  failed: boolean[];   // true = ключ временно не работает
  index: number;       // round-robin указатель
  name: string;
}

const providers: ProviderState[] = [
  { keys: CEREBRAS_KEYS, failed: CEREBRAS_KEYS.map(() => false), index: 0, name: 'Cerebras' },
  { keys: GROQ_KEYS, failed: GROQ_KEYS.map(() => false), index: 0, name: 'Groq' },
  { keys: SAMBANOVA_KEYS, failed: SAMBANOVA_KEYS.map(() => false), index: 0, name: 'SambaNova' },
  { keys: OPENROUTER_KEYS, failed: OPENROUTER_KEYS.map(() => false), index: 0, name: 'OpenRouter' },
];

// ---------- Очередь запросов ----------

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
const REQUEST_TIMEOUT = 45000; // 45 секунд

// ---------- Helper: найти рабочий ключ ----------

function getNextKey(state: ProviderState): string | null {
  if (state.keys.length === 0) return null;

  for (let i = 0; i < state.keys.length; i++) {
    const idx = (state.index + i) % state.keys.length;
    if (!state.failed[idx]) {
      state.index = (idx + 1) % state.keys.length;
      return state.keys[idx];
    }
  }
  return null; // Все ключи этого провайдера временно не работают
}

function markKeyFailed(state: ProviderState, key: string) {
  const idx = state.keys.indexOf(key);
  if (idx >= 0) {
    state.failed[idx] = true;
    // Сброс через 120 секунд
    setTimeout(() => { state.failed[idx] = false; }, 120000);
  }
}

function countAvailable(state: ProviderState): number {
  return state.keys.length - state.failed.filter(Boolean).length;
}

// ---------- SYSTEM PROMPT ----------

const SYSTEM_PROMPT = `Ты — Нексо AI, умный и дружелюбный ассистент мессенджера Нексо.

Правила:
- Отвечай кратко и по делу
- Если пользователь пишет "ну ты понял" или подобное — отвечай с юмором
- Пиши на русском языке, если пользователь не указал другой язык
- Используй markdown для форматирования (жирный, курсив, списки, код)
- Для блоков кода используй тройные кавычки с указанием языка`;

// ============================================
// СТРИМИНГ — CEREBRAS
// ============================================

async function streamCerebras(messages: any[], res: ExpressResponse, key: string, isSimple: boolean): Promise<boolean> {
  const model = isSimple ? 'llama3.1-8b' : 'qwen-3-235b-a22b-instruct-2507';

  const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      stream: true,
      max_completion_tokens: 2048,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    if (response.status === 429 || response.status >= 500) return false;
    throw new Error(`Cerebras ${response.status}: ${err}`);
  }

  return consumeSSEStream(response, res);
}

// ============================================
// СТРИМИНГ — GROQ
// ============================================

async function streamGroq(messages: any[], res: ExpressResponse, key: string): Promise<boolean> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      stream: true,
      max_tokens: 2048,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    if (response.status === 429 || response.status >= 500) return false;
    throw new Error(`Groq ${response.status}: ${err}`);
  }

  return consumeSSEStream(response, res);
}

// ============================================
// СТРИМИНГ — SAMBANOVA
// ============================================

async function streamSambaNova(messages: any[], res: ExpressResponse, key: string): Promise<boolean> {
  const response = await fetch('https://api.sambanova.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'Meta-Llama-3.1-70B-Instruct',
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      stream: true,
      max_tokens: 2048,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    if (response.status === 429 || response.status >= 500) return false;
    throw new Error(`SambaNova ${response.status}: ${err}`);
  }

  return consumeSSEStream(response, res);
}

// ============================================
// СТРИМИНГ — OPENROUTER
// ============================================

async function streamOpenRouter(messages: any[], res: ExpressResponse, key: string): Promise<boolean> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://нексо-0hs3.onrender.com',
      'X-Title': 'Нексо AI',
    },
    body: JSON.stringify({
      model: 'mistralai/mistral-7b-instruct:free',
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      stream: true,
      max_tokens: 2048,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    if (response.status === 429 || response.status >= 500) return false;
    throw new Error(`OpenRouter ${response.status}: ${err}`);
  }

  return consumeSSEStream(response, res);
}

// ============================================
// SSE STREAM CONSUMER (универсальный)
// ============================================

async function consumeSSEStream(fetchResponse: globalThis.Response, res: ExpressResponse): Promise<boolean> {
  const reader = fetchResponse.body?.getReader();
  if (!reader) return false;

  const decoder = new TextDecoder();
  let fullText = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const json = JSON.parse(line.slice(6));
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              fullText += content;
              res.write(`data: ${JSON.stringify({ token: content })}\n\n`);
            }
          } catch { /* игнорируем ошибки парсинга SSE */ }
        }
      }
    }

    res.write(`data: ${JSON.stringify({ done: true, text: fullText })}\n\n`);
    return true;
  } catch {
    return false;
  }
}

// ============================================
// НЕ-СТРИМ ЗАПРОСЫ (для JSON endpoint)
// ============================================

async function requestCerebras(messages: any[], key: string, isSimple: boolean): Promise<string> {
  const model = isSimple ? 'llama3.1-8b' : 'qwen-3-235b-a22b-instruct-2507';
  const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      max_completion_tokens: 2048,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) throw new Error('RATE_LIMIT');
    throw new Error(`Cerebras ${response.status}`);
  }

  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || '';
}

async function requestGroq(messages: any[], key: string): Promise<string> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      max_tokens: 2048,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) throw new Error('RATE_LIMIT');
    throw new Error(`Groq ${response.status}`);
  }

  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || '';
}

async function requestSambaNova(messages: any[], key: string): Promise<string> {
  const response = await fetch('https://api.sambanova.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'Meta-Llama-3.1-70B-Instruct',
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      max_tokens: 2048,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) throw new Error('RATE_LIMIT');
    throw new Error(`SambaNova ${response.status}`);
  }

  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || '';
}

async function requestOpenRouter(messages: any[], key: string): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://нексо-0hs3.onrender.com',
      'X-Title': 'Нексо AI',
    },
    body: JSON.stringify({
      model: 'mistralai/mistral-7b-instruct:free',
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      max_tokens: 2048,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) throw new Error('RATE_LIMIT');
    throw new Error(`OpenRouter ${response.status}`);
  }

  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || '';
}

// ============================================
// ОПРЕДЕЛЕНИЕ ТИПА ЗАПРОСА
// ============================================

/**
 * Простой запрос — короткое сообщение, приветствие, перевод
 * Использует лёгкую модель для скорости
 */
function isSimpleQuery(messages: any[]): boolean {
  const lastMsg = messages[messages.length - 1]?.content || '';
  return lastMsg.length < 100;
}

// ============================================
// ОСНОВНОЙ БАЛАНСИРОВЩИК — СТРИМИНГ
// ============================================

async function tryStream(messages: any[], res: ExpressResponse): Promise<boolean> {
  const isSimple = isSimpleQuery(messages);

  // 1. CEREBRAS
  const cerberasState = providers[0];
  const cKey = getNextKey(cerberasState);
  if (cKey) {
    const ok = await streamCerebras(messages, res, cKey, isSimple);
    if (ok) return true;
    markKeyFailed(cerberasState, cKey);
  }

  // 2. GROQ
  const groqState = providers[1];
  const gKey = getNextKey(groqState);
  if (gKey) {
    const ok = await streamGroq(messages, res, gKey);
    if (ok) return true;
    markKeyFailed(groqState, gKey);
  }

  // 3. SAMBANOVA
  const snState = providers[2];
  const sKey = getNextKey(snState);
  if (sKey) {
    const ok = await streamSambaNova(messages, res, sKey);
    if (ok) return true;
    markKeyFailed(snState, sKey);
  }

  // 4. OPENROUTER
  const orState = providers[3];
  const oKey = getNextKey(orState);
  if (oKey) {
    const ok = await streamOpenRouter(messages, res, oKey);
    if (ok) return true;
    markKeyFailed(orState, oKey);
  }

  return false;
}

// ============================================
// ОСНОВНОЙ БАЛАНСИРОВЩИК — JSON
// ============================================

async function tryRequest(messages: any[]): Promise<string> {
  const isSimple = isSimpleQuery(messages);
  let lastError = '';

  // 1. CEREBRAS
  const cState = providers[0];
  const cKey = getNextKey(cState);
  if (cKey) {
    try { return await requestCerebras(messages, cKey, isSimple); }
    catch (e: any) { if (e.message !== 'RATE_LIMIT') lastError = e.message; markKeyFailed(cState, cKey); }
  }

  // 2. GROQ
  const gState = providers[1];
  const gKey = getNextKey(gState);
  if (gKey) {
    try { return await requestGroq(messages, gKey); }
    catch (e: any) { if (e.message !== 'RATE_LIMIT') lastError = e.message; markKeyFailed(gState, gKey); }
  }

  // 3. SAMBANOVA
  const sState = providers[2];
  const sKey = getNextKey(sState);
  if (sKey) {
    try { return await requestSambaNova(messages, sKey); }
    catch (e: any) { if (e.message !== 'RATE_LIMIT') lastError = e.message; markKeyFailed(sState, sKey); }
  }

  // 4. OPENROUTER
  const oState = providers[3];
  const oKey = getNextKey(oState);
  if (oKey) {
    try { return await requestOpenRouter(messages, oKey); }
    catch (e: any) { if (e.message !== 'RATE_LIMIT') lastError = e.message; markKeyFailed(oState, oKey); }
  }

  throw new Error(lastError || 'Все AI сервисы временно недоступны');
}

// ============================================
// ОБРАБОТКА ОЧЕРЕДИ
// ============================================

async function processQueue() {
  if (isProcessingQueue || requestQueue.length === 0) return;
  isProcessingQueue = true;

  while (requestQueue.length > 0) {
    const req = requestQueue.shift();
    if (!req) continue;

    // Таймаут
    if (Date.now() - req.timestamp > REQUEST_TIMEOUT) {
      req.reject(new Error('Request timeout'));
      continue;
    }

    try {
      if (req.stream && req.res) {
        const ok = await tryStream(req.messages, req.res);
        if (ok) { req.res.end(); req.resolve(true); }
        else req.reject(new Error('All providers failed'));
      } else {
        const text = await tryRequest(req.messages);
        req.resolve({ text });
      }
    } catch (error) {
      req.reject(error as Error);
    }
  }

  isProcessingQueue = false;
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
    const text = await tryRequest(messages);
    res.json({ text });
  } catch (error: any) {
    // Ставим в очередь если есть место
    if (requestQueue.length < MAX_QUEUE_SIZE) {
      const promise = new Promise<any>((resolve, reject) => {
        requestQueue.push({ resolve, reject, messages, stream: false, timestamp: Date.now() });
      });

      processQueue();

      try {
        const result = await promise;
        res.json(result);
      } catch {
        res.status(503).json({ error: 'Нексо AI перегружен, попробуй через несколько секунд' });
      }
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
    const ok = await tryStream(messages, res);
    if (ok) { res.end(); return; }
  } catch { /* пробуем очередь */ }

  // Очередь
  if (requestQueue.length < MAX_QUEUE_SIZE) {
    const promise = new Promise<any>((resolve, reject) => {
      requestQueue.push({ resolve, reject, messages, stream: true, res, timestamp: Date.now() });
    });

    processQueue();

    try {
      await promise;
    } catch {
      res.write(`data: ${JSON.stringify({ error: 'Нексо AI перегружен, попробуй через несколько секунд' })}\n\n`);
    }
  } else {
    res.write(`data: ${JSON.stringify({ error: 'Нексо AI перегружен, попробуй позже' })}\n\n`);
  }

  res.end();
});

/**
 * GET /api/ai/status — статус всех провайдеров
 */
router.get('/status', authenticateToken, (_req: AuthRequest, res: ExpressResponse) => {
  res.json({
    providers: providers.map(p => ({
      name: p.name,
      total: p.keys.length,
      available: countAvailable(p),
      failed: p.failed.filter(Boolean).length,
    })),
    queue: requestQueue.length,
  });
});

/**
 * POST /api/ai/context — AI с контекстом из сообщения
 * Принимает messageId и chatId, загружает контекст сообщения
 */
router.post('/context', authenticateToken, async (req: AuthRequest, res: ExpressResponse) => {
  const { messageId, chatId, question } = req.body;

  if (!messageId || !chatId) {
    res.status(400).json({ error: 'messageId и chatId обязательны' });
    return;
  }

  try {
    // Загружаем сообщение с контекстом
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

    // Загружаем последние 10 сообщений из чата для контекста
    const contextMessages = await prisma.message.findMany({
      where: { chatId, createdAt: { lte: message.createdAt } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        sender: { select: { displayName: true, username: true } },
      },
    });

    // Формируем контекст для AI
    const context = contextMessages.reverse().map(m => 
      `${m.sender.displayName || m.sender.username}: ${m.content || '[медиа]'}`
    ).join('\n');

    const aiMessages = [
      {
        role: 'user',
        content: `Контекст переписки:\n${context}\n\nВопрос пользователя: ${question || 'Проанализируй это сообщение и дай совет'}`,
      },
    ];

    const text = await tryRequest(aiMessages);
    res.json({ text, context });
  } catch (error: any) {
    console.error('Ошибка AI context:', error);
    res.status(500).json({ error: error.message || 'Ошибка обработки контекста' });
  }
});

/**
 * POST /api/ai/suggestions — Умные предложения ответов
 * Анализирует последнее сообщение и предлагает 3 варианта ответа
 */
router.post('/suggestions', authenticateToken, async (req: AuthRequest, res: ExpressResponse) => {
  const { chatId, lastMessage } = req.body;

  if (!chatId || !lastMessage) {
    res.status(400).json({ error: 'chatId и lastMessage обязательны' });
    return;
  }

  try {
    const aiMessages = [
      {
        role: 'user',
        content: `Последнее сообщение: "${lastMessage}"

Предложи 3 варианта ответа на это сообщение. Ответы должны быть:
1. Короткими (до 50 символов)
2. Естественными и дружелюбными
3. Разными по тону (формальный, дружеский, эмоциональный)

Формат ответа - только 3 строки, каждая с одним вариантом ответа, без нумерации и пояснений.`,
      },
    ];

    const text = await tryRequest(aiMessages);
    const suggestions = text.split('\n').filter(s => s.trim()).slice(0, 3);
    
    res.json({ suggestions });
  } catch (error: any) {
    console.error('Ошибка AI suggestions:', error);
    res.status(500).json({ error: error.message || 'Ошибка генерации предложений' });
  }
});

/**
 * POST /api/ai/autocomplete — Автодополнение текста
 * Предлагает продолжение текста на основе введённого
 */
router.post('/autocomplete', authenticateToken, async (req: AuthRequest, res: ExpressResponse) => {
  const { text } = req.body;

  if (!text || text.length < 3) {
    res.json({ completion: '' });
    return;
  }

  try {
    const aiMessages = [
      {
        role: 'user',
        content: `Продолжи это предложение естественным образом (максимум 10 слов): "${text}"

Верни ТОЛЬКО продолжение, без повтора исходного текста и без пояснений.`,
      },
    ];

    const completion = await tryRequest(aiMessages);
    res.json({ completion: completion.trim() });
  } catch (error: any) {
    console.error('Ошибка AI autocomplete:', error);
    res.json({ completion: '' });
  }
});

/**
 * POST /api/ai/grammar — Проверка и исправление грамматики
 * Исправляет ошибки в тексте и возвращает исправленную версию
 */
router.post('/grammar', authenticateToken, async (req: AuthRequest, res: ExpressResponse) => {
  const { text } = req.body;

  if (!text) {
    res.status(400).json({ error: 'text обязателен' });
    return;
  }

  try {
    const aiMessages = [
      {
        role: 'user',
        content: `Исправь грамматические и орфографические ошибки в этом тексте: "${text}"

Верни ТОЛЬКО исправленный текст, без пояснений. Если ошибок нет, верни исходный текст.`,
      },
    ];

    const corrected = await tryRequest(aiMessages);
    const hasChanges = corrected.trim() !== text.trim();
    
    res.json({ 
      corrected: corrected.trim(),
      hasChanges,
      original: text,
    });
  } catch (error: any) {
    console.error('Ошибка AI grammar:', error);
    res.status(500).json({ error: error.message || 'Ошибка проверки грамматики' });
  }
});

// ============================================
// ГЕНЕРАЦИЯ ИЗОБРАЖЕНИЙ
// ============================================

// Загрузка ключей для генерации изображений
function loadImageKeys(prefix: string, count: number): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= count; i++) {
    const key = process.env[`${prefix}_${i}`];
    if (key) keys.push(key);
  }
  return keys;
}

const FAL_KEYS = loadImageKeys('FAL_KEY', 4);
const HF_KEYS = loadImageKeys('HF_KEY', 4);

let falKeyIndex = 0;
let hfKeyIndex = 0;
const failedFalKeys = new Set<string>();
const failedHfKeys = new Set<string>();

function getNextFalKey(): string | null {
  const available = FAL_KEYS.filter(k => !failedFalKeys.has(k));
  if (!available.length) return null;
  const key = available[falKeyIndex % available.length];
  falKeyIndex++;
  return key;
}

function getNextHfKey(): string | null {
  const available = HF_KEYS.filter(k => !failedHfKeys.has(k));
  if (!available.length) return null;
  const key = available[hfKeyIndex % available.length];
  hfKeyIndex++;
  return key;
}

async function generateWithFal(prompt: string, key: string): Promise<string> {
  const response = await fetch('https://fal.run/fal-ai/flux/schnell', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      image_size: 'square_hd',
      num_inference_steps: 4,
      num_images: 1,
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    if (response.status === 429 || response.status >= 500) throw new Error('RATE_LIMIT');
    throw new Error(`Fal.ai ${response.status}: ${err}`);
  }

  const data = await response.json() as any;
  const imageUrl = data.images?.[0]?.url;
  if (!imageUrl) throw new Error('No image URL in response');
  return imageUrl;
}

async function generateWithHuggingFace(prompt: string, key: string): Promise<string> {
  const response = await fetch('https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inputs: prompt }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    if (response.status === 429 || response.status === 503) throw new Error('RATE_LIMIT');
    throw new Error(`HuggingFace ${response.status}: ${err}`);
  }

  // HF returns binary image data
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  return `data:image/jpeg;base64,${base64}`;
}

async function generateWithPollinations(prompt: string): Promise<string> {
  const encodedPrompt = encodeURIComponent(prompt);
  const seed = Math.floor(Math.random() * 1000000);
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&seed=${seed}&nologo=true&enhance=true`;
}

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

  // 1. Пробуем Fal.ai (4 ключа)
  for (let i = 0; i < FAL_KEYS.length; i++) {
    const key = getNextFalKey();
    if (!key) break;
    try {
      const url = await generateWithFal(cleanPrompt, key);
      res.json({ url, provider: 'Fal.ai' });
      return;
    } catch (e: any) {
      if (e.message === 'RATE_LIMIT') {
        failedFalKeys.add(key);
        setTimeout(() => failedFalKeys.delete(key), 60000);
        continue;
      }
      console.error('[AI Image] Fal.ai error:', e.message);
    }
  }

  // 2. Пробуем Hugging Face (4 ключа)
  for (let i = 0; i < HF_KEYS.length; i++) {
    const key = getNextHfKey();
    if (!key) break;
    try {
      const url = await generateWithHuggingFace(cleanPrompt, key);
      res.json({ url, provider: 'Hugging Face' });
      return;
    } catch (e: any) {
      if (e.message === 'RATE_LIMIT') {
        failedHfKeys.add(key);
        setTimeout(() => failedHfKeys.delete(key), 60000);
        continue;
      }
      console.error('[AI Image] HuggingFace error:', e.message);
    }
  }

  // 3. Fallback: Pollinations.ai (бесплатный, без ключа)
  try {
    const url = await generateWithPollinations(cleanPrompt);
    res.json({ url, provider: 'Pollinations.ai' });
    return;
  } catch (e: any) {
    console.error('[AI Image] Pollinations error:', e.message);
  }

  res.status(503).json({ error: 'Все сервисы генерации изображений временно недоступны' });
});

// ============================================
// РЕЗЮМЕ ЧАТА
// ============================================

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
    // Проверяем доступ к чату
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member) {
      res.status(403).json({ error: 'Нет доступа к чату' });
      return;
    }

    // Загружаем последние N сообщений
    const messages = await prisma.message.findMany({
      where: { chatId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      include: {
        sender: { select: { displayName: true, username: true } },
      },
    });

    if (messages.length === 0) {
      res.json({ summary: 'В чате пока нет сообщений.' });
      return;
    }

    const context = messages.reverse().map(m =>
      `${m.sender.displayName || m.sender.username}: ${m.content || '[медиа]'}`
    ).join('\n');

    const aiMessages = [
      {
        role: 'user',
        content: `Сделай краткое резюме этой переписки (3-5 предложений). Выдели ключевые темы, решения и важные моменты. Пиши на русском языке.

Переписка:
${context}`,
      },
    ];

    const summary = await tryRequest(aiMessages);

    // Сохраняем резюме в базу данных
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

// ============================================
// ТЕГИ СООБЩЕНИЙ
// ============================================

/**
 * GET /api/ai/summaries/:chatId — Получить все резюме чата
 */
router.get('/summaries/:chatId', authenticateToken, async (req: AuthRequest, res: ExpressResponse) => {
  const chatId = String(req.params.chatId);
  const userId = req.userId!;

  try {
    // Проверяем доступ к чату
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

export default router;


// ============================================
// ПРОКСИ ДЛЯ СКАЧИВАНИЯ AI-ИЗОБРАЖЕНИЙ
// ============================================

/**
 * POST /api/ai/download-image — Скачать изображение через сервер (обход CORS)
 * Принимает URL изображения, скачивает на сервере и возвращает как base64
 */
router.post('/download-image', authenticateToken, async (req: AuthRequest, res: ExpressResponse) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'url обязателен' });
    return;
  }

  // Разрешаем только известные AI-сервисы
  const allowedDomains = [
    'fal.run', 'fal.media', 'storage.googleapis.com',
    'image.pollinations.ai',
    'api-inference.huggingface.co',
    'cdn.openai.com',
  ];

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    res.status(400).json({ error: 'Некорректный URL' });
    return;
  }

  const isAllowed = allowedDomains.some(d => parsedUrl.hostname.endsWith(d));
  if (!isAllowed) {
    res.status(403).json({ error: 'Домен не разрешён' });
    return;
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Nexo-App/1.0' },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      res.status(502).json({ error: `Ошибка загрузки: ${response.status}` });
      return;
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
