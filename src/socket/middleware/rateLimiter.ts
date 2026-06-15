// ─── Socket rate limiting ────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 1000;
const RATE_LIMIT_MAX = 10;

export function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

// ─── Group call rate limiting ─────────────────────────────────────────
const callRateLimitMap = new Map<string, { count: number; resetAt: number }>();
const CALL_RATE_LIMIT_WINDOW = 5000;
const CALL_RATE_LIMIT_MAX = 3;

export function checkCallRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = callRateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    callRateLimitMap.set(userId, { count: 1, resetAt: now + CALL_RATE_LIMIT_WINDOW });
    return true;
  }
  entry.count++;
  return entry.count <= CALL_RATE_LIMIT_MAX;
}

// Clean up stale rate-limit entries every 30s
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap) {
    if (now > val.resetAt) rateLimitMap.delete(key);
  }
  for (const [key, val] of callRateLimitMap) {
    if (now > val.resetAt) callRateLimitMap.delete(key);
  }
}, 30_000);
