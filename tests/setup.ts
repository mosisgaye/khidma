import { jest } from '@jest/globals';

// ============ CONFIGURATION GLOBALE DES TESTS ============

// Augmenter le timeout pour les tests d'intégration
jest.setTimeout(30000);

// ============ VARIABLES GLOBALES POUR LES TESTS ============

// Variables d'environnement pour les tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing-only';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/khidma_test';

// ============ DONNÉES DE TEST COMMUNES ============

export const testUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  password: '$2b$10$hashedpassword',
  firstName: 'Test',
  lastName: 'User',
  phone: '+221701234567',
  role: 'EXPEDITEUR' as const,
  status: 'ACTIVE' as const,
  emailVerified: true,
  phoneVerified: true,
  twoFactorEnabled: false,
  preferredLanguage: 'fr',
  timezone: 'Africa/Dakar',
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const testTransporteur = {
  id: 'test-transporteur-id',
  userId: 'test-user-id',
  companyName: 'Test Transport',
  licenseNumber: 'TT123456',
  phoneNumber: '+221701234567',
  isVerified: true,
  status: 'ACTIVE' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const testVehicle = {
  id: 'test-vehicle-id',
  transporteurId: 'test-transporteur-id',
  type: 'TRUCK' as const,
  brand: 'Mercedes',
  model: 'Sprinter',
  year: 2020,
  licensePlate: 'DK-1234-AB',
  capacity: 1000,
  status: 'AVAILABLE' as const,
  currentLocation: 'Dakar',
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const testOrder = {
  id: 'test-order-id',
  expediteurId: 'test-user-id',
  transporteurId: null,
  vehicleId: null,
  goodsType: 'GENERAL' as const,
  weight: 100,
  volume: 1,
  departureLocation: 'Dakar',
  arrivalLocation: 'Thiès',
  departureDate: new Date(),
  status: 'PENDING' as const,
  totalPrice: null,
  description: 'Test goods',
  specialRequirements: [],
  declaredValue: 50000,
  isUrgent: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ============ HELPERS DE TEST ============

export const resetMocks = () => {
  jest.clearAllMocks();
};

// Mock functions helpers
export const createMockResponse = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
  send: jest.fn().mockReturnThis(),
  cookie: jest.fn().mockReturnThis(),
  clearCookie: jest.fn().mockReturnThis(),
});

export const createMockRequest = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  user: null,
  ...overrides,
});

// ============ SETUP/TEARDOWN ============

beforeEach(() => {
  resetMocks();
});

afterAll(async () => {
  // Cleanup code here if needed
});