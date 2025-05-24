import request from 'supertest';
import app from '../src/app';
import { UserRole } from '@prisma/client';

// Mock des modules externes pour les tests
jest.mock('../src/config/database');
jest.mock('../src/config/redis');

describe('API Auth Endpoints', () => {
  
  describe('GET /api/v1/auth', () => {
    it('should return API info', async () => {
      const response = await request(app)
        .get('/api/v1')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('Khidma Service'),
        data: expect.objectContaining({
          version: '1.0.0',
          name: 'Khidma Service API'
        })
      });
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('opérationnel'),
        data: expect.objectContaining({
          status: 'healthy',
          uptime: expect.any(Number)
        })
      });
    });
  });

  describe('POST /api/v1/auth/register', () => {
    const validRegistrationData = {
      email: 'test@khidmaservice.com',
      password: 'TestPassword123!',
      confirmPassword: 'TestPassword123!',
      firstName: 'Mamadou',
      lastName: 'Diallo',
      phone: '+221771234567',
      role: UserRole.EXPEDITEUR,
      acceptTerms: true,
      companyName: 'Test Company'
    };

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({})
        .expect(422);

      expect(response.body).toMatchObject({
        success: false,
        error: 'VALIDATION_ERROR',
        errors: expect.arrayContaining([
          expect.objectContaining({
            field: expect.stringContaining('email')
          })
        ])
      });
    });

    it('should validate email format', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          ...validRegistrationData,
          email: 'invalid-email'
        })
        .expect(422);

      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
            message: 'Format email invalide'
          })
        ])
      );
    });

    it('should validate password strength', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          ...validRegistrationData,
          password: 'weak',
          confirmPassword: 'weak'
        })
        .expect(422);

      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'password'
          })
        ])
      );
    });

    it('should validate password confirmation', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          ...validRegistrationData,
          confirmPassword: 'DifferentPassword123!'
        })
        .expect(422);

      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'confirmPassword',
            message: 'Les mots de passe ne correspondent pas'
          })
        ])
      );
    });

    it('should validate Senegalese phone format', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          ...validRegistrationData,
          phone: '+33123456789' // French number
        })
        .expect(422);

      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'phone',
            message: expect.stringContaining('Format téléphone invalide')
          })
        ])
      );
    });

    it('should accept valid Senegalese phone formats', async () => {
      const validPhones = [
        '+221771234567',
        '221771234567',
        '771234567'
      ];

      for (const phone of validPhones) {
        const response = await request(app)
          .post('/api/v1/auth/register')
          .send({
            ...validRegistrationData,
            phone,
            email: `test${Math.random()}@khidmaservice.com` // Unique email
          });

        // Peut échouer pour d'autres raisons (DB, etc.) mais pas pour le téléphone
        if (response.status === 422) {
          const phoneError = response.body.errors?.find((e: any) => e.field === 'phone');
          expect(phoneError).toBeUndefined();
        }
      }
    });

    it('should require terms acceptance', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          ...validRegistrationData,
          acceptTerms: false
        })
        .expect(422);

      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'acceptTerms',
            message: expect.stringContaining('accepter les conditions')
          })
        ])
      );
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should validate login fields', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({})
        .expect(422);

      expect(response.body).toMatchObject({
        success: false,
        error: 'VALIDATION_ERROR'
      });
    });

    it('should validate email format in login', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'invalid-email',
          password: 'password123'
        })
        .expect(422);

      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
            message: 'Format email invalide'
          })
        ])
      );
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting to auth endpoints', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      // Faire plusieurs tentatives rapidement
      const promises = Array(6).fill(null).map(() =>
        request(app)
          .post('/api/v1/auth/login')
          .send(loginData)
      );

      const responses = await Promise.all(promises);
      
      // Au moins une réponse devrait être rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 routes gracefully', async () => {
      const response = await request(app)
        .get('/api/v1/nonexistent-route')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        message: expect.stringContaining('non trouvée'),
        error: 'NOT_FOUND'
      });
    });

    it('should handle invalid JSON', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        message: 'JSON invalide',
        error: 'INVALID_JSON'
      });
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/api/v1')
        .expect(200);

      // Vérifier que Helmet ajoute les headers de sécurité
      expect(response.headers).toMatchObject({
        'x-dns-prefetch-control': 'off',
        'x-frame-options': 'SAMEORIGIN',
        'x-download-options': 'noopen',
        'x-content-type-options': 'nosniff'
      });
    });

    it('should handle CORS properly', async () => {
      const response = await request(app)
        .options('/api/v1/auth/login')
        .set('Origin', 'http://localhost:3000')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toContain('POST');
    });
  });
});

// Tests des utilitaires
describe('Password Utilities', () => {
  it('should hash passwords securely', async () => {
    const { hashPassword, verifyPassword } = await import('../src/utils/password.util');
    
    const password = 'TestPassword123!';
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(hash.length).toBeGreaterThan(50);
    
    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);
    
    const isInvalid = await verifyPassword('wrongpassword', hash);
    expect(isInvalid).toBe(false);
  });

  it('should validate password strength', async () => {
    const { validatePasswordStrength } = await import('../src/utils/password.util');
    
    const weakPassword = 'weak';
    const strongPassword = 'StrongPassword123!@#';

    const weakResult = validatePasswordStrength(weakPassword);
    expect(weakResult.isValid).toBe(false);
    expect(weakResult.score).toBeLessThan(3);

    const strongResult = validatePasswordStrength(strongPassword);
    expect(strongResult.isValid).toBe(true);
    expect(strongResult.score).toBeGreaterThanOrEqual(3);
  });
});

// Tests des schémas de validation
describe('Validation Schemas', () => {
  it('should validate email format correctly', async () => {
    const { isValidEmail } = await import('../src/schemas/auth.schema');

    expect(isValidEmail('test@example.com')).toBe(true);
    expect(isValidEmail('user@khidmaservice.com')).toBe(true);
    expect(isValidEmail('invalid-email')).toBe(false);
    expect(isValidEmail('test@')).toBe(false);
    expect(isValidEmail('@example.com')).toBe(false);
  });

  it('should validate Senegalese phone numbers', async () => {
    const { isValidPhone } = await import('../src/schemas/auth.schema');

    expect(isValidPhone('+221771234567')).toBe(true);
    expect(isValidPhone('221771234567')).toBe(true);
    expect(isValidPhone('771234567')).toBe(true);
    expect(isValidPhone('+33123456789')).toBe(false);
    expect(isValidPhone('123456')).toBe(false);
  });
});