import request from 'supertest';
import express from 'express';
import { createMockRequest, createMockResponse, testUser } from './setup';

// Mock des dépendances
jest.mock('@/config/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    expediteur: {
      create: jest.fn(),
    },
    transporteur: {
      create: jest.fn(),
    },
    client: {
      create: jest.fn(),
    },
  },
}));

jest.mock('@/config/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));

import { prisma } from '@/config/database';
import { redis } from '@/config/redis';
import authController from '@/controllers/auth.controller';

describe('🔐 Tests Authentication Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('📝 Registration Tests', () => {
    it('should register a new user successfully', async () => {
      const mockRequest = createMockRequest({
        body: {
          email: 'test@example.com',
          password: 'Password123!',
          firstName: 'Test',
          lastName: 'User',
          phone: '+221701234567',
          role: 'EXPEDITEUR',
        },
      });
      const mockResponse = createMockResponse();

      // Mock Prisma calls
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue(testUser);
      (prisma.expediteur.create as jest.Mock).mockResolvedValue({
        id: 'expediteur-id',
        userId: testUser.id,
      });

      await authController.register(mockRequest as any, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.any(String),
          data: expect.objectContaining({
            user: expect.any(Object),
          }),
        })
      );
    });

    it('should reject registration with existing email', async () => {
      const mockRequest = createMockRequest({
        body: {
          email: 'existing@example.com',
          password: 'Password123!',
          firstName: 'Test',
          lastName: 'User',
          phone: '+221701234567',
          role: 'EXPEDITEUR',
        },
      });
      const mockResponse = createMockResponse();

      // Mock existing user
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(testUser);

      await authController.register(mockRequest as any, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('existe déjà'),
        })
      );
    });
  });

  describe('🔑 Login Tests', () => {
    it('should login user with correct credentials', async () => {
      const mockRequest = createMockRequest({
        body: {
          email: 'test@example.com',
          password: 'Password123!',
        },
      });
      const mockResponse = createMockResponse();

      // Mock user with hashed password
      const userWithHashedPassword = {
        ...testUser,
        password: '$2b$10$hashedpassword',
      };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(userWithHashedPassword);
      (redis.set as jest.Mock).mockResolvedValue('OK');

      await authController.login(mockRequest as any, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            user: expect.any(Object),
            tokens: expect.objectContaining({
              accessToken: expect.any(String),
              refreshToken: expect.any(String),
            }),
          }),
        })
      );
    });

    it('should reject login with incorrect password', async () => {
      const mockRequest = createMockRequest({
        body: {
          email: 'test@example.com',
          password: 'WrongPassword',
        },
      });
      const mockResponse = createMockResponse();

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(testUser);

      await authController.login(mockRequest as any, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('invalides'),
        })
      );
    });
  });

  describe('🚪 Logout Tests', () => {
    it('should logout user successfully', async () => {
      const mockRequest = createMockRequest({
        headers: {
          authorization: 'Bearer valid-token',
        },
        user: testUser,
      });
      const mockResponse = createMockResponse();

      (redis.del as jest.Mock).mockResolvedValue(1);

      await authController.logout(mockRequest as any, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.stringContaining('déconnecté'),
        })
      );
    });
  });

  describe('🔄 Token Refresh Tests', () => {
    it('should refresh token successfully', async () => {
      const mockRequest = createMockRequest({
        body: {
          refreshToken: 'valid-refresh-token',
        },
      });
      const mockResponse = createMockResponse();

      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify(testUser));
      (redis.set as jest.Mock).mockResolvedValue('OK');

      await authController.refreshToken(mockRequest as any, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            tokens: expect.objectContaining({
              accessToken: expect.any(String),
              refreshToken: expect.any(String),
            }),
          }),
        })
      );
    });
  });

  describe('👤 Profile Tests', () => {
    it('should get user profile successfully', async () => {
      const mockRequest = createMockRequest({
        user: testUser,
      });
      const mockResponse = createMockResponse();

      await authController.getProfile(mockRequest as any, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            user: expect.any(Object),
          }),
        })
      );
    });

    it('should update user profile successfully', async () => {
      const mockRequest = createMockRequest({
        user: testUser,
        body: {
          firstName: 'Updated',
          lastName: 'Name',
        },
      });
      const mockResponse = createMockResponse();

      const updatedUser = { ...testUser, firstName: 'Updated', lastName: 'Name' };
      (prisma.user.update as jest.Mock).mockResolvedValue(updatedUser);

      await authController.updateProfile(mockRequest as any, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            user: expect.any(Object),
          }),
        })
      );
    });
  });
});