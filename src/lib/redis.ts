import { createClient, RedisClientType } from 'redis';
import { config } from '../config';

let client: RedisClientType | null = null;

/**
 * Получить Redis клиент. Создаётся один раз, переиспользуется.
 * Если Redis не настроен — возвращает null (fallback на in-memory).
 */
export async function getRedisClient(): Promise<RedisClientType | null> {
  if (client) return client;
  
  const redisUrl = config.redisUrl;
  if (!redisUrl) {
    console.log('[Redis] Not configured, using in-memory fallback');
    return null;
  }

  try {
    client = createClient({ url: redisUrl });
    
    client.on('error', (err) => {
      console.error('[Redis] Error:', err.message);
    });
    
    client.on('connect', () => {
      console.log('  ✓ Redis подключён');
    });
    
    await client.connect();
    return client;
  } catch (err: any) {
    console.error('[Redis] Connection failed:', err.message);
    console.log('[Redis] Falling back to in-memory storage');
    client = null;
    return null;
  }
}

/**
 * In-memory fallback storage для случаев когда Redis недоступен.
 * Используется только в dev/локальном окружении.
 */
class InMemoryStore {
  private store = new Map<string, { value: string; expiresAt?: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.store.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async incr(key: string): Promise<number> {
    const entry = this.store.get(key);
    const val = entry ? parseInt(entry.value, 10) + 1 : 1;
    this.store.set(key, { value: String(val), expiresAt: entry?.expiresAt });
    return val;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    const entry = this.store.get(key);
    if (entry) {
      entry.expiresAt = Date.now() + ttlSeconds * 1000;
    }
  }

  async ttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return -2;
    if (!entry.expiresAt) return -1;
    return Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000));
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return Array.from(this.store.keys()).filter(k => regex.test(k));
  }

  async setHash(key: string, field: string, value: string): Promise<void> {
    const existing = this.store.get(key);
    let hash: Record<string, string> = {};
    if (existing) {
      try { hash = JSON.parse(existing.value); } catch { /* empty */ }
    }
    hash[field] = value;
    this.store.set(key, { value: JSON.stringify(hash), expiresAt: existing?.expiresAt });
  }

  async getHash(key: string, field: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    try {
      const hash = JSON.parse(entry.value);
      return hash[field] || null;
    } catch {
      return null;
    }
  }

  async getAllHash(key: string): Promise<Record<string, string>> {
    const entry = this.store.get(key);
    if (!entry) return {};
    try {
      return JSON.parse(entry.value);
    } catch {
      return {};
    }
  }

  async deleteHash(key: string, field: string): Promise<void> {
    const entry = this.store.get(key);
    if (!entry) return;
    try {
      const hash = JSON.parse(entry.value);
      delete hash[field];
      this.store.set(key, { value: JSON.stringify(hash), expiresAt: entry?.expiresAt });
    } catch { /* empty */ }
  }
}

const memStore = new InMemoryStore();

/**
 * Универсальный интерфейс для key-value хранилища.
 * Автоматически выбирает Redis или in-memory.
 */
export const store = {
  async get(key: string): Promise<string | null> {
    const redis = await getRedisClient();
    if (redis) {
      try { return await redis.get(key); }
      catch { return memStore.get(key); }
    }
    return memStore.get(key);
  },

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const redis = await getRedisClient();
    if (redis) {
      try {
        if (ttlSeconds) await redis.setEx(key, ttlSeconds, value);
        else await redis.set(key, value);
        return;
      } catch { /* empty */ }
    }
    await memStore.set(key, value, ttlSeconds);
  },

  async del(key: string): Promise<void> {
    const redis = await getRedisClient();
    if (redis) {
      try { await redis.del(key); return; } catch { /* empty */ }
    }
    await memStore.del(key);
  },

  async incr(key: string): Promise<number> {
    const redis = await getRedisClient();
    if (redis) {
      try { return await redis.incr(key); } catch { /* empty */ }
    }
    return memStore.incr(key);
  },

  async expire(key: string, ttlSeconds: number): Promise<void> {
    const redis = await getRedisClient();
    if (redis) {
      try { await redis.expire(key, ttlSeconds); return; } catch { /* empty */ }
    }
    await memStore.expire(key, ttlSeconds);
  },

  async ttl(key: string): Promise<number> {
    const redis = await getRedisClient();
    if (redis) {
      try { return await redis.ttl(key); } catch { /* empty */ }
    }
    return memStore.ttl(key);
  },

  async exists(key: string): Promise<boolean> {
    const redis = await getRedisClient();
    if (redis) {
      try { return (await redis.exists(key)) > 0; } catch { /* empty */ }
    }
    return memStore.exists(key);
  },

  // Hash operations
  async setHash(key: string, field: string, value: string): Promise<void> {
    const redis = await getRedisClient();
    if (redis) {
      try { await redis.hSet(key, field, value); return; } catch { /* empty */ }
    }
    await memStore.setHash(key, field, value);
  },

  async getHash(key: string, field: string): Promise<string | null> {
    const redis = await getRedisClient();
    if (redis) {
      try { const v = await redis.hGet(key, field); return v ?? null; } catch { /* empty */ }
    }
    return memStore.getHash(key, field);
  },

  async getAllHash(key: string): Promise<Record<string, string>> {
    const redis = await getRedisClient();
    if (redis) {
      try {
        const result = await redis.hGetAll(key);
        return result as Record<string, string>;
      } catch { /* empty */ }
    }
    return memStore.getAllHash(key);
  },

  async deleteHash(key: string, field: string): Promise<void> {
    const redis = await getRedisClient();
    if (redis) {
      try { await redis.hDel(key, field); return; } catch { /* empty */ }
    }
    await memStore.deleteHash(key, field);
  },
};
