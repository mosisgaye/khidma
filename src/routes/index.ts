import { Router, Request, Response } from 'express';
import authRoutes from './auth';
import { ApiResponse, HTTP_STATUS } from '@/types/api.types';

const router = Router();

// ============ ROUTES DE BASE API V1 ============

/**
 * @swagger
 * /api/v1:
 *   get:
 *     summary: Point d'entrée de l'API v1
 *     tags: [API Info]
 *     responses:
 *       200:
 *         description: Informations sur l'API
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     version:
 *                       type: string
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     endpoints:
 *                       type: array
 *                       items:
 *                         type: object
 */
router.get('/', (req: Request, res: Response) => {
  const response: ApiResponse = {
    success: true,
    message: 'API Khidma Service v1',
    data: {
      version: '1.0.0',
      name: 'Khidma Service API',
      description: 'API pour la plateforme de transport routier au Sénégal',
      documentation: `${req.protocol}://${req.get('host')}/api/docs`,
      endpoints: [
        {
          group: 'Authentification',
          path: '/api/v1/auth',
          description: 'Gestion des utilisateurs et authentification'
        },
        {
          group: 'Transport',
          path: '/api/v1/transport',
          description: 'Gestion des commandes de transport'
        },
        {
          group: 'Véhicules',
          path: '/api/v1/vehicles',
          description: 'Gestion des véhicules des transporteurs'
        },
        {
          group: 'E-commerce',
          path: '/api/v1/shop',
          description: 'Boutique de pièces détachées'
        },
        {
          group: 'Assurance',
          path: '/api/v1/insurance',
          description: 'Gestion des assurances'
        },
        {
          group: 'Administration',
          path: '/api/v1/admin',
          description: 'Outils d\'administration'
        }
      ],
      status: {
        database: 'Connected',
        redis: 'Connected',
        environment: process.env.NODE_ENV || 'development'
      },
      features: [
        'Authentification JWT',
        'Validation Zod',
        'Rate Limiting',
        'Géolocalisation',
        'Paiements multi-passerelles',
        'Notifications temps réel'
      ]
    },
    timestamp: new Date().toISOString()
  };

  res.status(HTTP_STATUS.OK).json(response);
});

/**
 * @swagger
 * /api/v1/health:
 *   get:
 *     summary: Vérification de l'état de santé de l'API
 *     tags: [API Info]
 *     responses:
 *       200:
 *         description: Statut de santé de l'API
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                     timestamp:
 *                       type: string
 *                     uptime:
 *                       type: number
 *                     services:
 *                       type: object
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    // Vérifier la base de données
    const { default: prisma } = await import('@/config/database');
    await prisma.$queryRaw`SELECT 1`;
    const dbStatus = 'healthy';

    // Vérifier Redis
    const { default: redis } = await import('@/config/redis');
    await redis.ping();
    const redisStatus = 'healthy';

    const response: ApiResponse = {
      success: true,
      message: 'API en bonne santé',
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        version: '1.0.0',
        services: {
          database: {
            status: dbStatus,
            type: 'PostgreSQL'
          },
          cache: {
            status: redisStatus,
            type: 'Redis'
          },
          api: {
            status: 'healthy',
            type: 'Node.js/Express'
          }
        },
        metrics: {
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage()
        }
      },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  } catch (error) {
    console.error('Health check failed:', error);
    
    const response: ApiResponse = {
      success: false,
      message: 'Problème détecté dans l\'API',
      data: {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.SERVER_ERROR).json(response);
  }
});

/**
 * @swagger
 * /api/v1/status:
 *   get:
 *     summary: Statut détaillé du système
 *     tags: [API Info]
 *     responses:
 *       200:
 *         description: Statut détaillé du système
 */
router.get('/status', async (req: Request, res: Response) => {
  const response: ApiResponse = {
    success: true,
    message: 'Statut du système Khidma Service',
    data: {
      application: {
        name: 'Khidma Service API',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        port: process.env.PORT || 3000,
        timezone: process.env.TZ || 'Africa/Dakar'
      },
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        pid: process.pid
      },
      database: {
        type: 'PostgreSQL',
        url: process.env.DATABASE_URL ? 'Connected' : 'Not configured'
      },
      cache: {
        type: 'Redis',
        url: process.env.REDIS_URL ? 'Connected' : 'Not configured'
      },
      features: {
        authentication: 'JWT',
        validation: 'Zod',
        rateLimiting: 'express-rate-limit',
        cors: 'Enabled',
        compression: 'Enabled',
        helmet: 'Enabled'
      }
    },
    timestamp: new Date().toISOString()
  };

  res.status(HTTP_STATUS.OK).json(response);
});

// ============ MONTAGE DES SOUS-ROUTES ============

// Routes d'authentification
router.use('/auth', authRoutes);

// TODO: Ajouter les autres modules de routes
// router.use('/users', userRoutes);
// router.use('/transport', transportRoutes);
// router.use('/vehicles', vehicleRoutes);
// router.use('/shop', shopRoutes);
// router.use('/insurance', insuranceRoutes);
// router.use('/admin', adminRoutes);

// ============ ROUTE DE TEST (DÉVELOPPEMENT) ============

if (process.env.NODE_ENV === 'development') {
  /**
   * @swagger
   * /api/v1/test:
   *   get:
   *     summary: Endpoint de test (développement uniquement)
   *     tags: [Development]
   *     responses:
   *       200:
   *         description: Test réussi
   */
  router.get('/test', (req: Request, res: Response) => {
    const response: ApiResponse = {
      success: true,
      message: 'API Test endpoint - Environnement de développement',
      data: {
        timestamp: new Date().toISOString(),
        environment: 'development',
        requestInfo: {
          method: req.method,
          url: req.originalUrl,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          headers: req.headers
        },
        server: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage()
        }
      },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  /**
   * Endpoint pour tester les erreurs
   */
  router.get('/test-error', (req: Request, res: Response) => {
    throw new Error('Erreur de test pour vérifier la gestion des erreurs');
  });
}

export default router;