// Configuration globale pour tous les tests Jest
import 'tsconfig-paths/register';

// Mock des variables d'environnement pour les tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-tests-only';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-tests-only';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/khidma_test';
process.env.REDIS_URL = 'redis://localhost:6379/1';

// Timeout global pour les tests async
jest.setTimeout(30000);

// Mock de console.log pour les tests (optionnel)
if (process.env.TEST_SILENT === 'true') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

// Configuration de base pour les tests de base de données
export const testDatabaseConfig = {
  url: process.env.DATABASE_URL,
  logging: false
};

// Configuration Redis pour les tests
export const testRedisConfig = {
  url: process.env.REDIS_URL
};

// Helper pour nettoyer la base de données entre les tests
export const cleanupDatabase = async () => {
  // TODO: Implémenter le nettoyage de la base de données de test
  // Cette fonction sera appelée avant/après chaque test qui utilise la DB
};

// Helper pour créer des données de test
export const createTestUser = (overrides = {}) => ({
  email: 'test@example.com',
  password: 'TestPassword123!',
  firstName: 'Test',
  lastName: 'User',
  role: 'EXPEDITEUR',
  acceptTerms: true,
  ...overrides
});

// Helper pour créer des headers d'authentification
export const createAuthHeader = (token) => ({
  Authorization: `Bearer ${token}`
});

// Mock des services externes
export const mockExternalServices = () => {
  // Mock des services de paiement
  jest.mock('@/services/payment.service', () => ({
    processPayment: jest.fn().mockResolvedValue({ success: true })
  }));
  
  // Mock des services de notification
  jest.mock('@/services/notification.service', () => ({
    sendEmail: jest.fn().mockResolvedValue(true),
    sendSMS: jest.fn().mockResolvedValue(true)
  }));
};

// Configuration des mocks par défaut
beforeAll(() => {
  mockExternalServices();
});

// Nettoyage après tous les tests
afterAll(async () => {
  // Fermer les connexions ouvertes
  await cleanupDatabase();
});