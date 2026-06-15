import { Request, Response, NextFunction } from 'express';

// ═══════════════════════════════════════════════════════════════════
// TEXT SANITIZATION
// ═══════════════════════════════════════════════════════════════════

const HTML_TAG_REGEX = /<[^>]*>/g;
const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
};

function decodeHTMLEntities(text: string): string {
  let result = text;
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    result = result.split(entity).join(char);
  }
  return result;
}

/**
 * Sanitize text content: strip HTML tags, decode entities, collapse whitespace
 */
export function sanitizeText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let result = decodeHTMLEntities(text);
  result = result.replace(HTML_TAG_REGEX, '');
  result = result.replace(/\s+/g, ' ').trim();
  return result;
}

/**
 * Validate content length
 */
export function validateContentLength(
  content: string | null | undefined,
  maxLength: number
): { valid: boolean; error?: string } {
  if (!content) return { valid: true };
  if (content.length > maxLength) {
    return {
      valid: false,
      error: `Содержимое слишком длинное. Максимум: ${maxLength} символов`,
    };
  }
  return { valid: true };
}

// ═══════════════════════════════════════════════════════════════════
// IN-MEMORY RATE LIMITER
// ═══════════════════════════════════════════════════════════════════

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 60 seconds
const _cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}, 60_000);

/**
 * Per-user rate limiter middleware factory
 * @param windowMs - time window in milliseconds
 * @param max - max requests per window
 * @param keyPrefix - prefix for the rate limit key
 */
export function createRateLimiter(
  windowMs: number,
  max: number,
  keyPrefix: string
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = (req as any).userId;
    if (!userId) {
      res.status(401).json({ error: 'Требуется авторизация' });
      return;
    }

    const now = Date.now();
    const key = `${keyPrefix}:${userId}`;

    let entry = rateLimitStore.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 1, resetAt: now + windowMs };
      rateLimitStore.set(key, entry);
      next();
      return;
    }

    entry.count++;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        error: `Слишком много запросов. Попробуйте через ${retryAfter} сек.`,
        retryAfter,
      });
      return;
    }

    next();
  };
}

// ═══════════════════════════════════════════════════════════════════
// CONTENT LENGTH LIMITS
// ═══════════════════════════════════════════════════════════════════

export const CONTENT_LIMITS = {
  WALL_POST: 10_000,
  WALL_COMMENT: 5_000,
  MESSAGE: 50_000,
  CHAT_GROUP_NAME: 100,
  CHAT_GROUP_MESSAGE: 10_000,
} as const;

// ═══════════════════════════════════════════════════════════════════
// RATE LIMITER INSTANCES (per-endpoint)
// ═══════════════════════════════════════════════════════════════════

// POST /wall/post — 5 posts per hour
export const wallPostLimiter = createRateLimiter(
  60 * 60 * 1000,
  5,
  'wall:post'
);

// POST /wall/post/:postId/react — 30 reactions per minute
export const wallReactionLimiter = createRateLimiter(
  60 * 1000,
  30,
  'wall:react'
);

// POST /wall/post/:postId/comment — 20 comments per minute
export const wallCommentLimiter = createRateLimiter(
  60 * 1000,
  20,
  'wall:comment'
);

// POST /messages/send (if needed) — 60 messages per minute
export const messageSendLimiter = createRateLimiter(
  60 * 1000,
  60,
  'messages:send'
);
