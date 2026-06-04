import { createClient } from 'redis';
import { REDIS_INSTANCES } from '../config';

interface RedisClientWrapper {
  client: ReturnType<typeof createClient>;
  id: string;
  available: boolean;
}

class RedisCache {
  private clients: RedisClientWrapper[] = [];
  private primaryIndex = 0;

  async initialize() {
    console.log('  📡 Подключение к Redis кэшу...');
    
    for (const instance of REDIS_INSTANCES) {
      try {
        const client = createClient({ url: instance.url });
        
        client.on('error', (err) => {
          console.error(`  ❌ Redis ${instance.id} error:`, err.message);
          const wrapper = this.clients.find(c => c.id === instance.id);
          if (wrapper) wrapper.available = false;
        });

        client.on('connect', () => {
          console.log(`  ✓ Redis ${instance.id} подключен`);
        });

        await client.connect();
        
        this.clients.push({
          client,
          id: instance.id,
          available: true,
        });
      } catch (error: any) {
        console.error(`  ❌ Redis ${instance.id} не подключился:`, error.message);
      }
    }

    const connected = this.clients.filter(c => c.available).length;
    console.log(`  ✓ Подключено ${connected}/${REDIS_INSTANCES.length} Redis инстансов`);
  }

  private getPrimaryClient() {
    const available = this.clients.filter(c => c.available);
    if (available.length === 0) {
      throw new Error('Нет доступных Redis клиентов');
    }
    return available[this.primaryIndex % available.length];
  }

  async set(key: string, value: Buffer, ttlSeconds: number = 3600): Promise<void> {
    const wrapper = this.getPrimaryClient();
    await wrapper.client.setEx(key, ttlSeconds, value.toString('base64'));
  }

  async get(key: string): Promise<Buffer | null> {
    const wrapper = this.getPrimaryClient();
    const data = await wrapper.client.get(key);
    return data ? Buffer.from(data, 'base64') : null;
  }

  async del(key: string): Promise<void> {
    const wrapper = this.getPrimaryClient();
    await wrapper.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const wrapper = this.getPrimaryClient();
    const result = await wrapper.client.exists(key);
    return result > 0;
  }

  getFileKey(fileId: string): string {
    return `file:${fileId}`;
  }

  async cacheFile(fileId: string, buffer: Buffer, ttlSeconds: number = 3600): Promise<void> {
    const key = await this.getFileKey(fileId);
    await this.set(key, buffer, ttlSeconds);
    console.log(`  💾 Файл ${fileId} закэширован (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
  }

  async getCachedFile(fileId: string): Promise<Buffer | null> {
    const key = await this.getFileKey(fileId);
    const cached = await this.get(key);
    if (cached) {
      console.log(`  💾 Файл ${fileId} получен из кэша`);
    }
    return cached;
  }

  async invalidateFile(fileId: string): Promise<void> {
    const key = await this.getFileKey(fileId);
    await this.del(key);
    console.log(`  🗑️ Файл ${fileId} удалён из кэша`);
  }

  async getStats() {
    const stats = await Promise.all(
      this.clients.map(async (wrapper) => {
        try {
          const info = await wrapper.client.info('memory');
          const usedMemory = info.match(/used_memory:(\d+)/)?.[1] || '0';
          return {
            id: wrapper.id,
            available: wrapper.available,
            usedMemory: parseInt(usedMemory) / 1024 / 1024,
          };
        } catch {
          return { id: wrapper.id, available: wrapper.available, usedMemory: 0 };
        }
      })
    );
    return stats;
  }

  async disconnect() {
    await Promise.all(this.clients.map(c => c.client.quit()));
  }
}

export const redisCache = new RedisCache();
