import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Configuration des variables d'environnement
dotenv.config();

const app: Application = express();
const port = parseInt(process.env.PORT || '3000');

// Middlewares de base
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes de test
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Bienvenue sur l\'API Khidma Service 🚛',
    version: '1.0.0',
    status: 'active',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    database: 'Prisma configuré ✅'
  });
});

app.get('/api/v1/test', (req: Request, res: Response) => {
  res.json({
    message: 'API Test endpoint fonctionnel ✅',
    timestamp: new Date().toISOString(),
    database: 'Prisma configuré ✅',
    security: 'Middlewares sécurité actifs ✅'
  });
});

// 404 handler
app.all('*', (req: Request, res: Response) => {
  res.status(404).json({
    error: 'Endpoint non trouvé',
    message: `La route ${req.originalUrl} n'existe pas`,
    availableEndpoints: ['/', '/health', '/api/v1/test']
  });
});

// Démarrage du serveur
app.listen(port, () => {
  console.log(`
🚀 Serveur Khidma Service démarré !
📍 URL: http://localhost:${port}
🌍 Environnement: ${process.env.NODE_ENV || 'development'}
📊 Health Check: http://localhost:${port}/health
🧪 Test API: http://localhost:${port}/api/v1/test
  `);
});

export default app;