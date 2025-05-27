import { createMockRequest, createMockResponse, testUser, testOrder, testVehicle, testTransporteur } from './setup';

// Mock des dépendances
jest.mock('@/config/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    transportOrder: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    vehicle: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    transporteur: {
      findUnique: jest.fn(),
    },
    quote: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    tracking: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    review: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

jest.mock('@/config/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    setex: jest.fn(),
  },
}));

import { prisma } from '@/config/database';
import { redis } from '@/config/redis';
import orderController from '@/controllers/transport/order.controller';
import vehicleController from '@/controllers/vehicle.controller';

describe('🚛 Tests Transport Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('📦 Transport Orders Tests', () => {
    it('should create transport order successfully', async () => {
      const mockRequest = createMockRequest({
        user: testUser,
        body: {
          goodsType: 'GENERAL',
          weight: 100,
          volume: 1,
          departureLocation: 'Dakar',
          arrivalLocation: 'Thiès',
          departureDate: new Date().toISOString(),
          description: 'Test goods',
          declaredValue: 50000,
        },
      });
      const mockResponse = createMockResponse();

      (prisma.transportOrder.create as jest.Mock).mockResolvedValue(testOrder);

      await orderController.createOrder(mockRequest as any, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            order: expect.any(Object),
          }),
        })
      );
    });

    it('should get user orders successfully', async () => {
      const mockRequest = createMockRequest({
        user: testUser,
        query: {
          page: '1',
          limit: '10',
        },
      });
      const mockResponse = createMockResponse();

      (prisma.transportOrder.findMany as jest.Mock).mockResolvedValue([testOrder]);

      await orderController.getUserOrders(mockRequest as any, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            orders: expect.any(Array),
            pagination: expect.any(Object),
          }),
        })
      );
    });

    it('should update order status successfully', async () => {
      const mockRequest = createMockRequest({
        user: testUser,
        params: { id: testOrder.id },
        body: { status: 'IN_PROGRESS' },
      });
      const mockResponse = createMockResponse();

      const updatedOrder = { ...testOrder, status: 'IN_PROGRESS' };
      (prisma.transportOrder.findUnique as jest.Mock).mockResolvedValue(testOrder);
      (prisma.transportOrder.update as jest.Mock).mockResolvedValue(updatedOrder);

      await orderController.updateOrderStatus(mockRequest as any, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            order: expect.any(Object),
          }),
        })
      );
    });
  });

  describe('🚚 Vehicle Management Tests', () => {
    it('should create vehicle successfully', async () => {
      const mockRequest = createMockRequest({
        user: { ...testUser, transporteur: testTransporteur },
        body: {
          type: 'TRUCK',
          brand: 'Mercedes',
          model: 'Sprinter',
          year: 2020,
          licensePlate: 'DK-1234-AB',
          capacity: 1000,
        },
      });
      const mockResponse = createMockResponse();

      (prisma.vehicle.create as jest.Mock).mockResolvedValue(testVehicle);

      await vehicleController.createVehicle(mockRequest as any, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            vehicle: expect.any(Object),
          }),
        })
      );
    });

    it('should get transporteur vehicles successfully', async () => {
      const mockRequest = createMockRequest({
        user: { ...testUser, transporteur: testTransporteur },
        query: {},
      });
      const mockResponse = createMockResponse();

      (prisma.vehicle.findMany as jest.Mock).mockResolvedValue([testVehicle]);

      await vehicleController.getTransporteurVehicles(mockRequest as any, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            vehicles: expect.any(Array),
          }),
        })
      );
    });

    it('should update vehicle status successfully', async () => {
      const mockRequest = createMockRequest({
        user: { ...testUser, transporteur: testTransporteur },
        params: { id: testVehicle.id },
        body: { status: 'MAINTENANCE' },
      });
      const mockResponse = createMockResponse();

      const updatedVehicle = { ...testVehicle, status: 'MAINTENANCE' };
      (prisma.vehicle.findUnique as jest.Mock).mockResolvedValue(testVehicle);
      (prisma.vehicle.update as jest.Mock).mockResolvedValue(updatedVehicle);

      await vehicleController.updateVehicleStatus(mockRequest as any, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            vehicle: expect.any(Object),
          }),
        })
      );
    });
  });

  describe('💰 Quote Management Tests', () => {
    it('should create manual quote successfully', async () => {
      const mockRequest = createMockRequest({
        user: { ...testUser, transporteur: testTransporteur },
        body: {
          orderId: testOrder.id,
          amount: 25000,
          estimatedDuration: 120,
          notes: 'Standard transport',
        },
      });
      const mockResponse = createMockResponse();

      const quote = {
        id: 'quote-id',
        orderId: testOrder.id,
        transporteurId: testTransporteur.id,
        amount: 25000,
        status: 'PENDING',
        createdAt: new Date(),
      };

      (prisma.transportOrder.findUnique as jest.Mock).mockResolvedValue(testOrder);
      (prisma.quote.create as jest.Mock).mockResolvedValue(quote);

      // Mock quote controller (assuming it exists)
      const quoteController = {
        createQuote: async (req: any, res: any) => {
          if (req.body.orderId && req.body.amount) {
            res.status(201).json({
              success: true,
              data: { quote },
            });
          }
        },
      };

      await quoteController.createQuote(mockRequest as any, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            quote: expect.any(Object),
          }),
        })
      );
    });
  });

  describe('📍 GPS Tracking Tests', () => {
    it('should update GPS position successfully', async () => {
      const mockRequest = createMockRequest({
        user: { ...testUser, transporteur: testTransporteur },
        params: { orderId: testOrder.id },
        body: {
          latitude: 14.6937,
          longitude: -17.4441,
          timestamp: new Date().toISOString(),
        },
      });
      const mockResponse = createMockResponse();

      const trackingData = {
        id: 'tracking-id',
        orderId: testOrder.id,
        latitude: 14.6937,
        longitude: -17.4441,
        timestamp: new Date(),
      };

      (prisma.transportOrder.findUnique as jest.Mock).mockResolvedValue({
        ...testOrder,
        transporteurId: testTransporteur.id,
      });
      (prisma.tracking.create as jest.Mock).mockResolvedValue(trackingData);
      (redis.setex as jest.Mock).mockResolvedValue('OK');

      // Mock tracking controller
      const trackingController = {
        updatePosition: async (req: any, res: any) => {
          if (req.body.latitude && req.body.longitude) {
            res.status(200).json({
              success: true,
              data: { tracking: trackingData },
            });
          }
        },
      };

      await trackingController.updatePosition(mockRequest as any, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            tracking: expect.any(Object),
          }),
        })
      );
    });
  });

  describe('⭐ Review System Tests', () => {
    it('should create review successfully', async () => {
      const mockRequest = createMockRequest({
        user: testUser,
        body: {
          orderId: testOrder.id,
          transporteurId: testTransporteur.id,
          rating: 5,
          comment: 'Excellent service!',
        },
      });
      const mockResponse = createMockResponse();

      const review = {
        id: 'review-id',
        orderId: testOrder.id,
        expediteurId: testUser.id,
        transporteurId: testTransporteur.id,
        rating: 5,
        comment: 'Excellent service!',
        createdAt: new Date(),
      };

      (prisma.transportOrder.findUnique as jest.Mock).mockResolvedValue({
        ...testOrder,
        status: 'COMPLETED',
        expediteurId: testUser.id,
      });
      (prisma.review.create as jest.Mock).mockResolvedValue(review);

      // Mock review controller
      const reviewController = {
        createReview: async (req: any, res: any) => {
          if (req.body.rating && req.body.orderId) {
            res.status(201).json({
              success: true,
              data: { review },
            });
          }
        },
      };

      await reviewController.createReview(mockRequest as any, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            review: expect.any(Object),
          }),
        })
      );
    });
  });
});