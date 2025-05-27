import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../src/app';
import { testData, resetMocks, mockUserInDatabase, mockNoUserInDatabase, generateTestJWT } from './setup';
import { hashPassword } from '../src/utils/password.util';

// ============ TESTS COMPLETS D'AUTHENTIFICATION ============

describe('🔐 Module Authentification - Tests Complets', () => {
  let authToken: string;
  let refreshToken: string;

  beforeEach(async () => {
    resetMocks();
    // Générer des tokens de test
    authToken = generateTestJWT({ 
      userId: testData.validUser.id, 
      email: testData.validUser.email,
      role: testData.validUser.role 
    });
    refreshToken = generateTestJWT({ 
      userId: testData.validUser.id,
      type: 'refresh'
    });
  });

  // ============ TESTS D'INSCRIPTION ============

  describe('POST /api/v1/auth/register', () => {
    test('✅ Inscription expéditeur valide', async () => {
      const mockPrisma = require('../src/config/database').default;
      
      // Mock: pas d'utilisateur existant
      mockPrisma.user.findUnique.mockResolvedValue(null);
      
      // Mock: création réussie
      const createdUser = {
        ...testData.validUser,
        email: testData.validRegistration.email,
        firstName: testData.validRegistration.firstName,
        lastName: testData.validRegistration.lastName
      };
      
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback({
          user: {
            create: jest.fn().mockResolvedValue(createdUser)
          },
          expediteur: {
            create: jest.fn().mockResolvedValue({
              id: 'expediteur-123',
              userId: createdUser.id,
              companyName: testData.validRegistration.companyName
            })
          }
        });
      });

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(testData.validRegistration)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Compte créé avec succès');
      expect(response.body.data.user.email).toBe(testData.validRegistration.email);
      expect(response.body.data.tokens).toHaveProperty('accessToken');
      expect(response.body.data.tokens).toHaveProperty('refreshToken');
    });

    test('✅ Inscription transporteur valide', async () => {
      const mockPrisma = require('../src/config/database').default;
      
      const transporteurData = {
        ...testData.validRegistration,
        role: 'TRANSPORTEUR',
        companyName: 'Transport Sall SARL',
        licenseNumber: 'TR-2024-002'
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);
      
      const createdUser = {
        ...testData.validUser,
        role: 'TRANSPORTEUR',
        email: transporteurData.email
      };
      
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback({
          user: {
            create: jest.fn().mockResolvedValue(createdUser)
          },
          transporteur: {
            create: jest.fn().mockResolvedValue({
              id: 'transporteur-123',
              userId: createdUser.id,
              companyName: transporteurData.companyName,
              licenseNumber: transporteurData.licenseNumber
            })
          }
        });
      });

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(transporteurData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.role).toBe('TRANSPORTEUR');
    });

    test('❌ Inscription avec email déjà utilisé', async () => {
      const mockPrisma = require('../src/config/database').default;
      
      // Mock: utilisateur existant
      mockPrisma.user.findUnique.mockResolvedValue(testData.validUser);

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(testData.validRegistration)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('existe déjà');
    });

    test('❌ Inscription avec données invalides', async () => {
      const invalidData = {
        email: 'invalid-email',
        password: '123',
        firstName: '',
        lastName: 'Test',
        role: 'INVALID_ROLE'
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });

    test('❌ Inscription sans accepter les conditions', async () => {
      const dataWithoutTerms = {
        ...testData.validRegistration,
        acceptTerms: false
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(dataWithoutTerms)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ============ TESTS DE CONNEXION ============

  describe('POST /api/v1/auth/login', () => {
    test('✅ Connexion avec email et mot de passe valides', async () => {
      const mockPrisma = require('../src/config/database').default;
      
      const hashedPassword = await hashPassword(testData.validLogin.password);
      const userWithPassword = {
        ...testData.validUser,
        password: hashedPassword
      };
      
      mockPrisma.user.findUnique.mockResolvedValue(userWithPassword);

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(testData.validLogin)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Connexion réussie');
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.tokens).toHaveProperty('accessToken');
      expect(response.body.data.tokens).toHaveProperty('refreshToken');
    });

    test('❌ Connexion avec email inexistant', async () => {
      const mockPrisma = require('../src/config/database').default;
      
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'inexistant@test.com',
          password: 'password123'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('invalides');
    });

    test('❌ Connexion avec mot de passe incorrect', async () => {
      const mockPrisma = require('../src/config/database').default;
      
      const hashedPassword = await hashPassword('correct-password');
      const userWithPassword = {
        ...testData.validUser,
        password: hashedPassword
      };
      
      mockPrisma.user.findUnique.mockResolvedValue(userWithPassword);

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testData.validUser.email,
          password: 'wrong-password'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('invalides');
    });

    test('❌ Connexion avec données manquantes', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testData.validUser.email
          // password manquant
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('❌ Connexion compte suspendu', async () => {
      const mockPrisma = require('../src/config/database').default;
      
      const suspendedUser = {
        ...testData.validUser,
        status: 'SUSPENDED',
        password: await hashPassword(testData.validLogin.password)
      };
      
      mockPrisma.user.findUnique.mockResolvedValue(suspendedUser);

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(testData.validLogin)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('suspendu');
    });
  });

  // ============ TESTS DE RAFRAÎCHISSEMENT DE TOKEN ============

  describe('POST /api/v1/auth/refresh', () => {
    test('✅ Rafraîchissement avec token valide', async () => {
      const mockPrisma = require('../src/config/database').default;
      const mockRedisUtils = require('../src/config/redis').redisUtils;
      
      // Mock: utilisateur existe
      mockPrisma.user.findUnique.mockResolvedValue(testData.validUser);
      
      // Mock: session Redis valide
      mockRedisUtils.getUserSession.mockResolvedValue({
        userId: testData.validUser.id,
        refreshToken: refreshToken
      });

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: refreshToken
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.tokens).toHaveProperty('accessToken');
      expect(response.body.data.tokens).toHaveProperty('refreshToken');
    });

    test('❌ Rafraîchissement avec token invalide', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: 'invalid-token'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('invalide');
    });

    test('❌ Rafraîchissement sans token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ============ TESTS DE DÉCONNEXION ============

  describe('POST /api/v1/auth/logout', () => {
    test('✅ Déconnexion avec token valide', async () => {
      const mockRedisUtils = require('../src/config/redis').redisUtils;
      
      // Mock: session supprimée
      mockRedisUtils.deleteUserSession.mockResolvedValue(1);

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Déconnexion réussie');
    });

    test('❌ Déconnexion sans token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  // ============ TESTS DE PROFIL UTILISATEUR ============

  describe('GET /api/v1/auth/me', () => {
    test('✅ Récupération profil utilisateur connecté', async () => {
      const mockPrisma = require('../src/config/database').default;
      
      // Mock: utilisateur avec profil
      const userWithProfile = {
        ...testData.validUser,
        expediteurProfile: {
          id: 'expediteur-123',
          companyName: 'Test Company',
          verified: true,
          totalOrders: 15
        }
      };
      
      mockPrisma.user.findUnique.mockResolvedValue(userWithProfile);

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(testData.validUser.email);
      expect(response.body.data.user.profile).toBeDefined();
      expect(response.body.data.user.profile.type).toBe('EXPEDITEUR');
    });

    test('❌ Récupération profil sans authentification', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  // ============ TESTS DE VÉRIFICATION EMAIL ============

  describe('POST /api/v1/auth/send-verification', () => {
    test('✅ Envoi email de vérification', async () => {
      const response = await request(app)
        .post('/api/v1/auth/send-verification')
        .send({
          email: testData.validUser.email
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('email de vérification');
    });

    test('❌ Envoi avec email invalide', async () => {
      const response = await request(app)
        .post('/api/v1/auth/send-verification')
        .send({
          email: 'invalid-email'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/verify-email', () => {
    test('✅ Vérification email avec token valide', async () => {
      const mockPrisma = require('../src/config/database').default;
      const mockRedisUtils = require('../src/config/redis').redisUtils;
      
      // Mock: token valide en cache
      mockRedisUtils.getCache.mockResolvedValue('valid-token-data');
      
      // Mock: mise à jour utilisateur
      mockPrisma.user.update.mockResolvedValue({
        ...testData.validUser,
        emailVerified: true
      });

      const response = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({
          email: testData.validUser.email,
          token: 'valid-verification-token'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('vérifié avec succès');
    });

    test('❌ Vérification avec token invalide', async () => {
      const mockRedisUtils = require('../src/config/redis').redisUtils;
      
      // Mock: pas de token en cache
      mockRedisUtils.getCache.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({
          email: testData.validUser.email,
          token: 'invalid-token'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ============ TESTS DE MOT DE PASSE ============

  describe('POST /api/v1/auth/forgot-password', () => {
    test('✅ Demande de réinitialisation mot de passe', async () => {
      const response = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({
          email: testData.validUser.email
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('lien de réinitialisation');
    });

    test('❌ Demande avec email invalide', async () => {
      const response = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({
          email: 'invalid-email'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/reset-password', () => {
    test('✅ Réinitialisation avec token valide', async () => {
      const mockPrisma = require('../src/config/database').default;
      const mockRedisUtils = require('../src/config/redis').redisUtils;
      
      // Mock: token valide
      mockRedisUtils.getCache.mockResolvedValue(JSON.stringify({
        userId: testData.validUser.id,
        email: testData.validUser.email,
        expires: Date.now() + 3600000
      }));
      
      // Mock: mise à jour mot de passe
      mockPrisma.user.update.mockResolvedValue(testData.validUser);

      const response = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: 'valid-reset-token',
          password: 'NewPassword123!',
          confirmPassword: 'NewPassword123!'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('réinitialisé avec succès');
    });

    test('❌ Réinitialisation mots de passe non identiques', async () => {
      const response = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: 'valid-token',
          password: 'NewPassword123!',
          confirmPassword: 'DifferentPassword123!'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ============ TESTS DE SESSIONS ============

  describe('GET /api/v1/auth/sessions', () => {
    test('✅ Récupération sessions actives', async () => {
      const mockRedisUtils = require('../src/config/redis').redisUtils;
      
      // Mock: session active
      mockRedisUtils.getUserSession.mockResolvedValue({
        userId: testData.validUser.id,
        loginTime: new Date(),
        lastActivity: new Date()
      });

      const response = await request(app)
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sessions).toBeDefined();
      expect(response.body.data.totalSessions).toBeGreaterThanOrEqual(0);
    });
  });

  describe('DELETE /api/v1/auth/sessions/:sessionId', () => {
    test('✅ Révocation session spécifique', async () => {
      const mockRedisUtils = require('../src/config/redis').redisUtils;
      
      // Mock: suppression session
      mockRedisUtils.deleteUserSession.mockResolvedValue(1);

      const response = await request(app)
        .delete('/api/v1/auth/sessions/current')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Session révoquée');
    });

    test('❌ Révocation sans ID de session', async () => {
      const response = await request(app)
        .delete('/api/v1/auth/sessions/')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  // ============ TESTS DE SÉCURITÉ ============

  describe('🔒 Tests de Sécurité', () => {
    test('❌ Tentative force brute (rate limiting)', async () => {
      const mockRedisUtils = require('../src/config/redis').redisUtils;
      
      // Mock: limite atteinte
      mockRedisUtils.checkRateLimit.mockResolvedValue({
        count: 6,
        remaining: 0,
        reset: Date.now() + 300000,
        blocked: true
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(testData.validLogin)
        .expect(429);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Trop de tentatives');
    });

    test('❌ Token malformé', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token-format')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    test('❌ Token expiré', async () => {
      const jwt = require('jsonwebtoken');
      const expiredToken = jwt.sign(
        { userId: testData.validUser.id },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' } // Expiré il y a 1h
      );

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    test('❌ Injection SQL dans email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: "'; DROP TABLE users; --",
          password: 'password'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('❌ Tentative XSS dans les données', async () => {
      const xssData = {
        ...testData.validRegistration,
        firstName: '<script>alert("xss")</script>',
        email: 'test-xss@example.com'
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(xssData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ============ TESTS DE PERFORMANCE ============

  describe('⚡ Tests de Performance', () => {
    test('⏱️ Temps de réponse login < 500ms', async () => {
      const mockPrisma = require('../src/config/database').default;
      
      const hashedPassword = await hashPassword(testData.validLogin.password);
      mockPrisma.user.findUnique.mockResolvedValue({
        ...testData.validUser,
        password: hashedPassword
      });

      const startTime = Date.now();
      
      await request(app)
        .post('/api/v1/auth/login')
        .send(testData.validLogin)
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(500);
    });

    test('⏱️ Temps de réponse registration < 1000ms', async () => {
      const mockPrisma = require('../src/config/database').default;
      
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback({
          user: {
            create: jest.fn().mockResolvedValue(testData.validUser)
          },
          expediteur: {
            create: jest.fn().mockResolvedValue({})
          }
        });
      });

      const startTime = Date.now();
      
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          ...testData.validRegistration,
          email: 'perf-test@example.com'
        })
        .expect(201);
      
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(1000);
    });
  });
});