import { createClient } from 'redis';

// Configuration Redis
const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  retry_strategy: (options) => {
    if (options.error && options.error.code === 'ECONNREFUSED') {
      console.error('Redis server connection refused');
      return new Error('Redis server connection refused');
    }
    if (options.total_retry_time > 1000 * 60 * 60) {
      return new Error('Retry time exhausted');
    }
    if (options.attempt > 10) {
      return undefined;
    }
    return Math.min(options.attempt * 100, 3000);
  }
});

// Connexion et gestion des erreurs
redis.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

redis.on('connect', () => {
  console.log('✅ Redis: Connexion établie');
});

redis.on('ready', () => {
  console.log('✅ Redis: Prêt à recevoir des commandes');
});

// Connexion automatique
redis.connect().catch(console.error);

// Utilitaires Redis
export const redisUtils = {
  // Gestion des sessions utilisateur
  async setUserSession(userId: string, sessionData: any, ttl: number = 3600): Promise<void> {
    const key = `khidma:session:${userId}`;
    await redis.setEx(key, ttl, JSON.stringify(sessionData));
  },

  async getUserSession(userId: string): Promise<any> {
    const key = `khidma:session:${userId}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  },

  async deleteUserSession(userId: string): Promise<number> {
    const key = `khidma:session:${userId}`;
    return await redis.del(key);
  },

  // Cache générique
  async setCache(key: string, data: any, ttl: number = 3600): Promise<void> {
    const fullKey = `khidma:cache:${key}`;
    await redis.setEx(fullKey, ttl, JSON.stringify(data));
  },

  async getCache(key: string): Promise<any> {
    const fullKey = `khidma:cache:${key}`;
    const data = await redis.get(fullKey);
    return data ? JSON.parse(data) : null;
  },

  async deleteCache(key: string): Promise<number> {
    const fullKey = `khidma:cache:${key}`;
    return await redis.del(key);
  },

  // Rate limiting
  async checkRateLimit(key: string, limit: number, window: number): Promise<{
    count: number;
    remaining: number;
    reset: number;
  }> {
    const fullKey = `khidma:ratelimit:${key}`;
    const count = await redis.incr(fullKey);
    
    if (count === 1) {
      await redis.expire(fullKey, window);
    }

    const ttl = await redis.ttl(fullKey);
    
    return {
      count,
      remaining: Math.max(0, limit - count),
      reset: Date.now() + (ttl * 1000)
    };
  }
};

export default redis;