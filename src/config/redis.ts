import Redis from 'ioredis';

// Configuration Redis avec gestion d'erreurs robuste
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  // retryDelayOnFailover: 100, // Removed as it is not a valid RedisOptions property
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
  lazyConnect: true, // Connexion à la demande
  // Retry strategy personnalisée
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  // Reconnection sur erreur
  enableOfflineQueue: false
});

// Gestion des événements Redis
redis.on('connect', () => {
  console.log('🔄 Redis: Tentative de connexion...');
});

redis.on('ready', () => {
  console.log('✅ Redis: Prêt à recevoir des commandes');
});

redis.on('error', (err) => {
  console.error('❌ Redis: Erreur de connexion:', err.message);
  if (process.env.NODE_ENV === 'production') {
    // En production, on pourrait implémenter un fallback
    console.warn('⚠️ Redis indisponible, fonctionnement en mode dégradé');
  }
});

redis.on('close', () => {
  console.log('🔌 Redis: Connexion fermée');
});

redis.on('reconnecting', () => {
  console.log('🔄 Redis: Reconnexion en cours...');
});

// Connexion conditionnelle (pas en mode test)
const connectRedis = async (): Promise<void> => {
  if (process.env.NODE_ENV === 'test') {
    console.log('🧪 Test mode: Redis non connecté');
    return;
  }

  try {
    await redis.connect();
    console.log('✅ Redis: Connexion établie');
  } catch (error) {
    console.error('❌ Redis: Échec de la connexion:', error);
    if (process.env.NODE_ENV === 'production') {
      // En production, ne pas planter l'app si Redis est indisponible
      console.warn('⚠️ Continuons sans Redis...');
    } else {
      throw error;
    }
  }
};

// Utilitaires Redis avec gestion d'erreurs
export const redisUtils = {
  // Test de disponibilité
  async isAvailable(): Promise<boolean> {
    try {
      await redis.ping();
      return true;
    } catch {
      return false;
    }
  },

  // Gestion des sessions utilisateur
  async setUserSession(userId: string, sessionData: any, ttl: number = 3600): Promise<void> {
    try {
      const key = `khidma:session:${userId}`;
      await redis.setex(key, ttl, JSON.stringify(sessionData));
    } catch (error) {
      console.error('Erreur Redis setUserSession:', error);
      // Ne pas faire planter l'app si Redis est indisponible
    }
  },

  async getUserSession(userId: string): Promise<any> {
    try {
      const key = `khidma:session:${userId}`;
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Erreur Redis getUserSession:', error);
      return null;
    }
  },

  async deleteUserSession(userId: string): Promise<number> {
    try {
      const key = `khidma:session:${userId}`;
      return await redis.del(key);
    } catch (error) {
      console.error('Erreur Redis deleteUserSession:', error);
      return 0;
    }
  },

  // Cache générique
  async setCache(key: string, data: any, ttl: number = 3600): Promise<void> {
    try {
      const fullKey = `khidma:cache:${key}`;
      await redis.setex(fullKey, ttl, JSON.stringify(data));
    } catch (error) {
      console.error('Erreur Redis setCache:', error);
    }
  },

  async getCache(key: string): Promise<any> {
    try {
      const fullKey = `khidma:cache:${key}`;
      const data = await redis.get(fullKey);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Erreur Redis getCache:', error);
      return null;
    }
  },

  async deleteCache(key: string): Promise<number> {
    try {
      const fullKey = `khidma:cache:${key}`;
      return await redis.del(fullKey);
    } catch (error) {
      console.error('Erreur Redis deleteCache:', error);
      return 0;
    }
  },

  // Rate limiting
  async checkRateLimit(key: string, limit: number, window: number): Promise<{
    count: number;
    remaining: number;
    reset: number;
  }> {
    try {
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
    } catch (error) {
      console.error('Erreur Redis checkRateLimit:', error);
      // En cas d'erreur Redis, on permet la requête
      return {
        count: 0,
        remaining: limit,
        reset: Date.now() + (window * 1000)
      };
    }
  },

  // Nettoyage des clés expirées
  async cleanup(): Promise<void> {
    try {
      const keys = await redis.keys('khidma:*');
      console.log(`🧹 Redis: ${keys.length} clés trouvées`);
      
      // Ne supprimer que les clés expirées explicitement
      const expiredKeys = [];
      for (const key of keys) {
        const ttl = await redis.ttl(key);
        if (ttl === -1) { // Pas d'expiration définie
          continue;
        }
        if (ttl <= 0) { // Expiré
          expiredKeys.push(key);
        }
      }
      
      if (expiredKeys.length > 0) {
        await redis.del(...expiredKeys);
        console.log(`🗑️ Redis: ${expiredKeys.length} clés expirées supprimées`);
      }
    } catch (error) {
      console.error('Erreur Redis cleanup:', error);
    }
  }
};

// Démarrage de la connexion
if (process.env.NODE_ENV !== 'test') {
  connectRedis();
}

// Nettoyage périodique (toutes les heures)
if (process.env.NODE_ENV === 'production') {
  setInterval(() => {
    redisUtils.cleanup();
  }, 60 * 60 * 1000); // 1 heure
}

export default redis;
export { connectRedis };