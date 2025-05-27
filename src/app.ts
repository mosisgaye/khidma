import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Configuration des variables d'environnement
dotenv.config();

// Import des routes et middlewares
import authRoutes from '@/routes/auth';
import transportRoutes from '@/routes/transport';
import { errorHandler, notFoundHandler, handleUncaughtErrors } from '@/middleware/errorHandler';
import { ApiResponse, HTTP_STATUS } from '@/types/api.types';

const app: Application = express();
const port = parseInt(process.env.PORT || '3000');

// ============ CONFIGURATION DE SÉCURITÉ ============

// Gestion des erreurs non capturées
handleUncaughtErrors();

// Headers de sécurité avec Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// Configuration CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://khidmaservice.com', 'https://app.khidmaservice.com']
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400 // 24 heures
}));

// ============ MIDDLEWARES DE BASE ============

// Compression des réponses
app.use(compression());

// Logging des requêtes
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Parsing JSON avec limite de taille
app.use(express.json({
  limit: '10mb',
  verify: (req: Request, res: Response, buf, encoding) => {
    try {
      JSON.parse(buf.toString());
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        message: 'JSON invalide',
        error: 'INVALID_JSON',
        timestamp: new Date().toISOString()
      };
      res.status(HTTP_STATUS.BAD_REQUEST).json(response);
      return;
    }
  }
}));

// Parsing des données de formulaire
app.use(express.urlencoded({ 
  extended: true,
  limit: '10mb'
}));

// Trust proxy pour obtenir la vraie IP derrière un reverse proxy
app.set('trust proxy', true);

// ============ ROUTES DE BASE ============

// Route de base - redirection vers l'API
app.get('/', (req: Request, res: Response) => {
  const response: ApiResponse = {
    success: true,
    message: 'Bienvenue sur l\'API Khidma Service 🚛',
    data: {
      version: '1.0.0',
      status: 'active',
      api: {
        v1: `${req.protocol}://${req.get('host')}/api/v1`,
        documentation: `${req.protocol}://${req.get('host')}/api/docs`,
        health: `${req.protocol}://${req.get('host')}/health`
      },
      description: 'Plateforme numérique de transport routier au Sénégal',
      features: [
        'Transport de marchandises',
        'E-commerce pièces détachées', 
        'Assurance en ligne',
        'Paiements sécurisés (Wave, Orange Money, Stripe)',
        'Géolocalisation GPS'
      ],
      support: {
        email: 'support@khidmaservice.com',
        phone: '+221 33 XXX XX XX',
        documentation: 'https://docs.khidmaservice.com'
      }
    },
    timestamp: new Date().toISOString()
  };

  res.status(HTTP_STATUS.OK).json(response);
});

// Health check global
app.get('/health', async (req: Request, res: Response) => {
  try {
    // Vérifier les connexions aux services
    await checkDatabaseConnection();
    await checkRedisConnection();

    const response: ApiResponse = {
      success: true,
      message: 'Serveur opérationnel',
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        environment: process.env.NODE_ENV || 'development',
        version: '1.0.0',
        database: 'Connected',
        cache: 'Connected'
      },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      message: 'Problème de santé du serveur',
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

// Route d'information de l'API v1
app.get('/api/v1', (req: Request, res: Response) => {
  const response: ApiResponse = {
    success: true,
    message: 'API Khidma Service v1',
    data: {
      name: 'Khidma Service API',
      version: '1.0.0',
      description: 'API REST pour la plateforme de transport routier au Sénégal',
      endpoints: {
        auth: `${req.protocol}://${req.get('host')}/api/v1/auth`,
        transport: `${req.protocol}://${req.get('host')}/api/v1/transport`,
        health: `${req.protocol}://${req.get('host')}/api/v1/health`
      },
      documentation: `${req.protocol}://${req.get('host')}/api/docs`,
      support: {
        email: 'dev@khidmaservice.com',
        documentation: 'https://docs.khidmaservice.com'
      }
    },
    timestamp: new Date().toISOString()
  };

  res.status(HTTP_STATUS.OK).json(response);
});

// Health check pour l'API v1
app.get('/api/v1/health', async (req: Request, res: Response) => {
  try {
    const { default: prisma } = await import('@/config/database');
    const { default: redis } = await import('@/config/redis');

    // Tests de connectivité
    await Promise.all([
      prisma.$queryRaw`SELECT 1`,
      redis.ping()
    ]);

    const response: ApiResponse = {
      success: true,
      message: 'API v1 opérationnelle',
      data: {
        api: 'v1',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          database: 'connected',
          redis: 'connected',
          authentication: 'active',
          transport: 'active'
        },
        performance: {
          uptime: Math.floor(process.uptime()),
          memory: process.memoryUsage(),
          cpuUsage: process.cpuUsage()
        }
      },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      message: 'Problème détecté dans l\'API v1',
      data: {
        api: 'v1',
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.SERVER_ERROR).json(response);
  }
});

// ============ ROUTES API ============

// Monter les routes API v1
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/transport', transportRoutes);

// TODO: Routes de documentation Swagger
// app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// ============ GESTION DES ERREURS ============

// Middleware 404 pour les routes non trouvées
app.use(notFoundHandler);

// Middleware de gestion globale des erreurs
app.use(errorHandler);

// ============ DÉMARRAGE DU SERVEUR ============

// Fonction de démarrage avec gestion des erreurs
const startServer = async (): Promise<void> => {
  try {
    // Vérifier les connexions aux services externes
    await checkDatabaseConnection();
    await checkRedisConnection();

    // Démarrer le serveur
    const server = app.listen(port, () => {
      console.log(`
🚀 Serveur Khidma Service démarré avec succès !
📍 URL: http://localhost:${port}
🌍 Environnement: ${process.env.NODE_ENV || 'development'}
🏥 Health Check: http://localhost:${port}/health
🔗 API v1: http://localhost:${port}/api/v1
📚 Documentation: http://localhost:${port}/api/docs (bientôt disponible)
⏰ Démarré le: ${new Date().toLocaleString('fr-SN', { timeZone: 'Africa/Dakar' })}
      `);
    });

    // Gestion gracieuse de l'arrêt
    const gracefulShutdown = (signal: string) => {
      console.log(`\n🔄 Signal ${signal} reçu, arrêt gracieux du serveur...`);
      
      server.close(async (error) => {
        if (error) {
          console.error('❌ Erreur lors de la fermeture du serveur:', error);
          process.exit(1);
        }

        console.log('✅ Serveur HTTP fermé');
        
        try {
          // Fermer les connexions aux bases de données
          const { default: prisma } = await import('@/config/database');
          await prisma.$disconnect();
          console.log('✅ Connexion PostgreSQL fermée');

          const { default: redis } = await import('@/config/redis');
          redis.disconnect();
          console.log('✅ Connexion Redis fermée');

          console.log('🎉 Arrêt gracieux terminé');
          process.exit(0);
        } catch (disconnectError) {
          console.error('❌ Erreur lors de la fermeture des connexions:', disconnectError);
          process.exit(1);
        }
      });

      // Forcer l'arrêt après 10 secondes
      setTimeout(() => {
        console.error('⚠️ Arrêt forcé après timeout');
        process.exit(1);
      }, 10000);
    };

    // Écouter les signaux d'arrêt
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('❌ Erreur lors du démarrage du serveur:', error);
    process.exit(1);
  }
};

// ============ VÉRIFICATION DES SERVICES ============

async function checkDatabaseConnection(): Promise<void> {
  try {
    const { default: prisma } = await import('@/config/database');
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ PostgreSQL: Connexion établie');
  } catch (error) {
    console.error('❌ PostgreSQL: Échec de la connexion:', error);
    throw error;
  }
}

async function checkRedisConnection(): Promise<void> {
  try {
    const { default: redis } = await import('@/config/redis');
    await redis.ping();
    console.log('✅ Redis: Connexion établie');
  } catch (error) {
    console.error('❌ Redis: Échec de la connexion:', error);
    throw error;
  }
}

// ============ DÉMARRAGE ============

// Démarrer le serveur seulement si ce fichier est exécuté directement
if (require.main === module) {
  startServer();
}

export default app;