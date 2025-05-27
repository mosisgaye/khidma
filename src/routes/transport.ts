import { Router, Request, Response } from 'express';
import { ApiResponse, HTTP_STATUS } from '@/types/api.types';

// Import des sous-routes de transport
import vehicleRoutes from './transport/vehicles';
// Les autres routes seront ajoutées progressivement
// import orderRoutes from './transport/orders';
// import quoteRoutes from './transport/quotes';
// import trackingRoutes from './transport/tracking';

const router = Router();

// ============ ROUTE DE BASE MODULE TRANSPORT ============

/**
 * @swagger
 * /api/v1/transport:
 *   get:
 *     summary: Point d'entrée du module transport
 *     tags: [Transport]
 *     responses:
 *       200:
 *         description: Informations sur le module transport
 */
router.get('/', (req: Request, res: Response) => {
  const response: ApiResponse = {
    success: true,
    message: 'Module Transport Khidma Service',
    data: {
      module: 'Transport de marchandises',
      version: '1.0.0',
      description: 'Gestion complète du transport routier au Sénégal',
      features: [
        'Gestion des véhicules',
        'Commandes de transport',
        'Système de devis automatisés',
        'Géolocalisation et suivi GPS',
        'Calcul automatique des distances',
        'Système d\'évaluation',
        'Planning et disponibilités',
        'Maintenance des véhicules'
      ],
      endpoints: [
        {
          group: 'Véhicules',
          path: '/api/v1/transport/vehicles',
          description: 'CRUD véhicules, statuts, maintenance',
          methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
        },
        {
          group: 'Commandes',
          path: '/api/v1/transport/orders',
          description: 'Commandes de transport, workflow complet',
          methods: ['GET', 'POST', 'PUT', 'PATCH'],
          status: 'À venir'
        },
        {
          group: 'Devis',
          path: '/api/v1/transport/quotes',
          description: 'Système de devis automatisés',
          methods: ['GET', 'POST', 'PATCH'],
          status: 'À venir'
        },
        {
          group: 'Suivi',
          path: '/api/v1/transport/tracking',
          description: 'Suivi GPS et événements',
          methods: ['GET', 'POST'],
          status: 'À venir'
        },
        {
          group: 'Géolocalisation',
          path: '/api/v1/transport/geolocation',
          description: 'Calculs de distance et optimisation',
          methods: ['POST'],
          status: 'À venir'
        }
      ],
      statistics: {
        vehicleTypes: 10,
        goodsTypes: 12,
        supportedRegions: 14,
        maxCapacity: '44 tonnes',
        gpsTracking: true
      }
    },
    timestamp: new Date().toISOString()
  };

  res.status(HTTP_STATUS.OK).json(response);
});

/**
 * @swagger
 * /api/v1/transport/health:
 *   get:
 *     summary: Vérification de l'état du module transport
 *     tags: [Transport]
 *     responses:
 *       200:
 *         description: Statut de santé du module transport
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    // Vérifier la connectivité base de données pour le transport
    const { default: prisma } = await import('@/config/database');
    
    // Statistiques rapides
    const [vehicleCount, orderCount] = await Promise.all([
      prisma.vehicle.count({ where: { isActive: true } }),
      prisma.transportOrder.count()
    ]);

    const response: ApiResponse = {
      success: true,
      message: 'Module Transport opérationnel',
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          database: 'connected',
          vehicleService: 'active',
          orderService: 'active',
          geoService: 'active'
        },
        statistics: {
          totalVehicles: vehicleCount,
          totalOrders: orderCount,
          lastUpdate: new Date().toISOString()
        },
        capabilities: {
          realTimeTracking: true,
          automaticQuoting: true,
          distanceCalculation: true,
          multiRegionSupport: true
        }
      },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  } catch (error) {
    console.error('Health check transport failed:', error);
    
    const response: ApiResponse = {
      success: false,
      message: 'Problème détecté dans le module transport',
      data: {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.SERVER_ERROR).json(response);
  }
});

// ============ MONTAGE DES SOUS-ROUTES ============

// Routes véhicules
router.use('/vehicles', vehicleRoutes);

// TODO: Ajouter les autres routes quand elles seront créées
// router.use('/orders', orderRoutes);
// router.use('/quotes', quoteRoutes);
// router.use('/tracking', trackingRoutes);
// router.use('/geolocation', geolocationRoutes);

// ============ ROUTE DE DOCUMENTATION ============

/**
 * @swagger
 * /api/v1/transport/docs:
 *   get:
 *     summary: Documentation du module transport
 *     tags: [Transport]
 *     responses:
 *       200:
 *         description: Documentation des APIs transport
 */
router.get('/docs', (req: Request, res: Response) => {
  const response: ApiResponse = {
    success: true,
    message: 'Documentation Module Transport',
    data: {
      title: 'API Transport Khidma Service',
      description: 'Documentation complète des endpoints de transport',
      version: '1.0.0',
      documentation: {
        swagger: `${req.protocol}://${req.get('host')}/api/docs`,
        postman: 'Collection Postman disponible sur demande',
        examples: `${req.protocol}://${req.get('host')}/api/v1/transport/examples`
      },
      guides: [
        {
          title: 'Guide Transporteur',
          description: 'Comment gérer sa flotte et accepter des commandes',
          topics: ['Créer des véhicules', 'Gérer les statuts', 'Accepter des commandes']
        },
        {
          title: 'Guide Expéditeur',
          description: 'Comment créer et suivre ses expéditions',
          topics: ['Créer une commande', 'Choisir un transporteur', 'Suivre la livraison']
        },
        {
          title: 'API Integration',
          description: 'Intégrer l\'API dans vos applications',
          topics: ['Authentification', 'Webhooks', 'Rate limiting']
        }
      ]
    },
    timestamp: new Date().toISOString()
  };

  res.status(HTTP_STATUS.OK).json(response);
});

// ============ EXEMPLES ET TESTS ============

if (process.env.NODE_ENV === 'development') {
  /**
   * Route pour les exemples de données (développement uniquement)
   */
  router.get('/examples', (req: Request, res: Response) => {
    const response: ApiResponse = {
      success: true,
      message: 'Exemples de données Transport',
      data: {
        vehicleExample: {
          type: 'CAMION_10T',
          brand: 'Mercedes-Benz',
          model: 'Actros',
          year: 2020,
          plateNumber: 'DK-1234-A',
          capacity: 10000,
          volume: 50,
          fuelType: 'DIESEL',
          features: ['GPS', 'Bâche', 'Hayon'],
          dailyRate: 50000,
          kmRate: 500
        },
        orderExample: {
          departureAddress: 'Dakar, Plateau',
          destinationAddress: 'Thiès, Centre-ville',
          goodsType: 'MATERIAUX_CONSTRUCTION',
          goodsDescription: 'Sacs de ciment Portland 50kg',
          weight: 5000,
          quantity: 100,
          departureDate: '2025-05-25T08:00:00Z',
          priority: 'NORMAL'
        },
        searchExample: {
          region: 'Dakar',
          vehicleType: 'CAMION_10T',
          minCapacity: 5000,
          departureDate: '2025-05-25'
        }
      },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  /**
   * Route de test pour vérifier les connexions
   */
  router.get('/test', async (req: Request, res: Response) => {
    try {
      const { default: prisma } = await import('@/config/database');
      
      // Test simple de requête
      const testQuery = await prisma.vehicle.findFirst({
        take: 1,
        select: { id: true, type: true, status: true }
      });

      const response: ApiResponse = {
        success: true,
        message: 'Test Module Transport réussi',
        data: {
          databaseConnection: 'OK',
          testQuery: testQuery ? 'OK' : 'NO_DATA',
          timestamp: new Date().toISOString(),
          requestInfo: {
            method: req.method,
            url: req.originalUrl,
            userAgent: req.get('User-Agent')
          }
        },
        timestamp: new Date().toISOString()
      };

      res.status(HTTP_STATUS.OK).json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        message: 'Erreur test Module Transport',
        data: {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      };

      res.status(HTTP_STATUS.SERVER_ERROR).json(response);
    }
  });
}

export default router;