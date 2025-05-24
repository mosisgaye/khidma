import { jest } from '@jest/globals';

// ============ CONFIGURATION GLOBALE DES TESTS ============

// Augmenter le timeout pour les tests d'intégration
jest.setTimeout(30000);

// ============ MOCKS DES SERVICES EXTERNES ============

// Mock de Prisma
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  expediteur: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  transporteur: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  client: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  region: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  city: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
  $disconnect: jest.fn(),
};

// Mock de Redis
const mockRedis = {
  ping: jest.fn().mockResolvedValue('PONG'),
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  quit: jest.fn(),
};

// Mock des utilitaires Redis
const mockRedisUtils = {
  setUserSession: jest.fn(),
  getUserSession: jest.fn(),
  deleteUserSession: jest.fn(),
  setCache: jest.fn(),
  getCache: jest.fn(),
  deleteCache: jest.fn(),
  checkRateLimit: jest.fn(),
};

// ============ SETUP DES MOCKS ============

// Mock du module de base de données
jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
}));

// Mock du module Redis
jest.mock('../src/config/redis', () => ({
  __esModule: true,
  default: mockRedis,
  redis: mockRedis,
  redisUtils: mockRedisUtils,
  getRedisKey: jest.fn((prefix: string, key: string) => `khidma:${prefix}:${key}`),
}));

// Mock des variables d'environnement
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing-only';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/khidma_test';
process.env.REDIS_URL = 'redis://localhost:6379';

// ============ HELPERS POUR LES TESTS ============

// Données de test communes
export const testData = {
  validUser: {
    id: 'test-user-id-123',
    email: 'test@khidmaservice.com',
    password: 'hashedpassword123',
    firstName: 'Mamadou',
    lastName: 'Diallo',
    phone: '+221771234567',
    role: 'EXPEDITEUR' as const,
    status: 'ACTIVE' as const,
    emailVerified: true,
    phoneVerified: true,
    twoFactorEnabled: false,
    preferredLanguage: 'fr',
    timezone: 'Africa/Dakar',
    createdAt: new Date(),
    updatedAt: new Date(),
  },

  validTransporteur: {
    id: 'test-transporteur-id-123',
    email: 'transporteur@khidmaservice.com',
    role: 'TRANSPORTEUR' as const,
    firstName: 'Ousmane',
    lastName: 'Ba',
    transporteurProfile: {
      companyName: 'Transport Ba SARL',
      licenseNumber: 'TR-2024-001',
      fleetSize: 5,
      verified: true,
      rating: 4.5,
      totalRides: 150,
      isOnline: true,
    }
  },

  validRegistration: {
    email: 'newuser@khidmaservice.com',
    password: 'TestPassword123!',
    confirmPassword: 'TestPassword123!',
    firstName: 'Aïcha',
    lastName: 'Ndiaye',
    phone: '+221771234567',
    role: 'EXPEDITEUR' as const,
    acceptTerms: true,
    companyName: 'Ndiaye Export SARL',
  },

  validLogin: {
    email: 'test@khidmaservice.com',
    password: 'TestPassword123!',
  },

  invalidEmails: [
    'invalid-email',
    'test@',
    '@example.com',
    'test.example.com',
    'test@.com',
    '',
  ],

  invalidPhones: [
    '+33123456789', // France
    '123456', // Trop court
    '+221123', // Trop court pour Sénégal
    '+1234567890123', // Trop long
    'not-a-phone',
    '',
  ],

  validPhones: [
    '+221771234567',
    '221771234567',
    '771234567',
    '+221701234567',
    '+221781234567',
  ],
};

// Helper pour reset les mocks
export const resetMocks = () => {
  jest.clearAllMocks();
  
  // Reset des mocks Prisma
  Object.values(mockPrisma).forEach(mock => {
    if (typeof mock === 'object' && mock !== null) {
      Object.values(mock).forEach(method => {
        if (jest.isMockFunction(method)) {
          method.mockReset();
        }
      });
    }
  });

  // Reset des mocks Redis
  Object.values(mockRedis).forEach(mock => {
    if (jest.isMockFunction(mock)) {
      mock.mockReset();
    }
  });

  Object.values(mockRedisUtils).forEach(mock => {
    if (jest.isMockFunction(mock)) {
      mock.mockReset();
    }
  });
};

// Helper pour mocker un utilisateur en base
export const mockUserInDatabase = (user = testData.validUser) => {
  (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(user);
  (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([user]);
  return user;
};

// Helper pour mocker l'absence d'utilisateur
export const mockNoUserInDatabase = () => {
  (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
  (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([]);
};

// Helper pour mocker une erreur de base de données
export const mockDatabaseError = (error: Error = new Error('Database connection failed')) => {
  (mockPrisma.user.findUnique as jest.Mock).mockRejectedValue(error);
  (mockPrisma.user.create as jest.Mock).mockRejectedValue(error);
  (mockPrisma.user.update as jest.Mock).mockRejectedValue(error);
};

// Helper pour mocker Redis en erreur
export const mockRedisError = (error: Error = new Error('Redis connection failed')) => {
  (mockRedis.ping as jest.Mock).mockRejectedValue(error);
  (mockRedis.get as jest.Mock).mockRejectedValue(error);
  (mockRedis.set as jest.Mock).mockRejectedValue(error);
};

// Helper pour générer un token JWT de test
export const generateTestJWT = (payload: any = { userId: 'test-user-id' }) => {
  const jwt = require('jsonwebtoken');
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
};

// ============ SETUP ET TEARDOWN GLOBAUX ============

beforeEach(() => {
  // Reset des mocks avant chaque test
  resetMocks();
  
  // Configuration par défaut des mocks
  (mockPrisma.$queryRaw as jest.Mock).mockResolvedValue([{ result: 1 }]);
  (mockRedis.ping as jest.Mock).mockResolvedValue('PONG');
  
  // Mock des utilitaires Redis par défaut
  (mockRedisUtils.setUserSession as jest.Mock).mockResolvedValue(undefined);
  (mockRedisUtils.getUserSession as jest.Mock).mockResolvedValue(null);
  (mockRedisUtils.deleteUserSession as jest.Mock).mockResolvedValue(1);
  (mockRedisUtils.checkRateLimit as jest.Mock).mockResolvedValue({
    count: 1,
    remaining: 4,
    reset: Date.now() + 60000
  });
});

afterEach(() => {
  // Nettoyage après chaque test
  jest.clearAllTimers();
});

beforeAll(() => {
  // Configuration globale avant tous les tests
  console.log('🧪 Configuration des tests Khidma Service');
});

afterAll(() => {
  // Nettoyage final après tous les tests
  console.log('✅ Tests Khidma Service terminés');
});