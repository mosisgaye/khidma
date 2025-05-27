import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../src/app';
import { testData, resetMocks, generateTestJWT } from './setup';

// ============ TESTS COMPLETS MODULE TRANSPORT ============

describe('🚛 Module Transport - Tests Complets', () => {
  let expediteurToken: string;
  let transporteurToken: string;
  let adminToken: string;
  
  // Données de test pour le transport
  const transportTestData = {
    validOrder: {
      departureAddressId: 'addr-departure-123',
      destinationAddressId: 'addr-destination-123',
      departureDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Demain
      departureTime: '08:00',
      deliveryDate: new Date(Date.now() + 48 * 60 * 60 * 1000), // Après-demain
      goodsType: 'MATERIAUX_CONSTRUCTION',
      goodsDescription: 'Ciment et briques pour construction',
      weight: 5000, // 5 tonnes
      volume: 15, // 15 m³
      quantity: 100,
      packagingType: 'Palettes',
      specialRequirements: ['Fragile', 'Bâché'],
      declaredValue: 2500000, // 2.5M XOF
      priority: 'NORMAL',
      notes: 'Livraison en matinée de préférence',
      departureContact: '+221771234567',
      destinationContact: '+221781234567',
      departureInstructions: 'Entrée par la porte principale',
      deliveryInstructions: 'Déchargement côté chantier'
    },

    validVehicle: {
      type: 'CAMION_10T',
      brand: 'Mercedes',
      model: 'Actros',
      year: 2020,
      plateNumber: 'DK-1234-AB',
      chassisNumber: 'WDB1234567890',
      capacity: 10, // tonnes
      volume: 50, // m³
      fuelType: 'DIESEL',
      features: ['GPS', 'Bâche', 'Hayon hydraulique'],
      insurance: 'ASS-2024-001',
      insuranceExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      dailyRate: 75000,
      kmRate: 150
    },

    validQuote: {
      basePrice: 150000,
      distancePrice: 45000,
      weightPrice: 25000,
      fuelSurcharge: 15000,
      tollFees: 8000,
      handlingFees: 10000,
      insuranceFees: 5000,
      otherFees: 2000,
      subtotal: 260000,
      taxes: 46800,
      totalPrice: 306800,
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      paymentTerms: 'Paiement à la livraison',
      deliveryTerms: 'Livraison dans les 48h',
      conditions: 'Devis valable 7 jours',
      notes: 'Devis incluant toutes charges'
    },

    validAddress: {
      id: 'addr-123',
      street: '15 Avenue Bourguiba',
      city: 'Dakar',
      region: 'Dakar',
      postalCode: '12000',
      latitude: 14.6928,
      longitude: -17.4467,
      isDefault: true
    }
  };

  beforeEach(async () => {
    resetMocks();
    
    // Générer des tokens pour différents rôles
    expediteurToken = generateTestJWT({
      userId: 'expediteur-user-123',
      email: 'expediteur@test.com',
      role: 'EXPEDITEUR',
      firstName: 'Amadou',
      lastName: 'Diop'
    });

    transporteurToken = generateTestJWT({
      userId: 'transporteur-user-123',
      email: 'transporteur@test.com',
      role: 'TRANSPORTEUR',
      firstName: 'Ousmane',
      lastName: 'Ba'
    });

    adminToken = generateTestJWT({
      userId: 'admin-user-123',
      email: 'admin@test.com',
      role: 'ADMIN',
      firstName: 'Admin',
      lastName: 'Khidma'
    });
  });

  // ============ TESTS COMMANDES TRANSPORT ============

  describe('📦 Gestion des Commandes Transport', () => {
    describe('POST /api/v1/transport/orders', () => {
      test('✅ Création commande valide par expéditeur', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        // Mock: profil expéditeur existe
        mockPrisma.expediteur.findUnique.mockResolvedValue({
          id: 'expediteur-123',
          userId: 'expediteur-user-123',
          user: { id: 'expediteur-user-123' }
        });

        // Mock: adresses valides
        mockPrisma.address.findMany.mockResolvedValue([
          { ...transportTestData.validAddress, id: transportTestData.validOrder.departureAddressId },
          { ...transportTestData.validAddress, id: transportTestData.validOrder.destinationAddressId }
        ]);

        // Mock: création commande
        const createdOrder = {
          id: 'order-123',
          orderNumber: 'TR20241225001',
          ...transportTestData.validOrder,
          expediteurId: 'expediteur-123',
          status: 'DEMANDE',
          estimatedDistance: 25.5,
          estimatedDuration: 45,
          basePrice: 150000,
          totalPrice: 150000,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        mockPrisma.transportOrder.create.mockResolvedValue(createdOrder);
        mockPrisma.transportOrder.findUnique.mockResolvedValue({
          ...createdOrder,
          expediteur: {
            id: 'expediteur-123',
            user: { firstName: 'Amadou', lastName: 'Diop' }
          },
          departureAddress: transportTestData.validAddress,
          destinationAddress: transportTestData.validAddress,
          quotes: [],
          trackingEvents: [],
          reviews: []
        });

        const response = await request(app)
          .post('/api/v1/transport/orders')
          .set('Authorization', `Bearer ${expediteurToken}`)
          .send(transportTestData.validOrder)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('créée avec succès');
        expect(response.body.data.order.orderNumber).toBeDefined();
        expect(response.body.data.order.status).toBe('DEMANDE');
      });

      test('❌ Création commande sans authentification', async () => {
        const response = await request(app)
          .post('/api/v1/transport/orders')
          .send(transportTestData.validOrder)
          .expect(401);

        expect(response.body.success).toBe(false);
      });

      test('❌ Création commande par transporteur (non autorisé)', async () => {
        const response = await request(app)
          .post('/api/v1/transport/orders')
          .set('Authorization', `Bearer ${transporteurToken}`)
          .send(transportTestData.validOrder)
          .expect(403);

        expect(response.body.success).toBe(false);
      });

      test('❌ Création commande avec données invalides', async () => {
        const invalidOrder = {
          ...transportTestData.validOrder,
          weight: -1000, // Poids négatif
          departureDate: new Date('2020-01-01'), // Date passée
          goodsType: 'INVALID_TYPE'
        };

        const response = await request(app)
          .post('/api/v1/transport/orders')
          .set('Authorization', `Bearer ${expediteurToken}`)
          .send(invalidOrder)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.errors).toBeDefined();
      });
    });

    describe('GET /api/v1/transport/orders', () => {
      test('✅ Liste des commandes expéditeur', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        // Mock: profil expéditeur
        mockPrisma.expediteur.findUnique.mockResolvedValue({
          id: 'expediteur-123'
        });

        // Mock: liste des commandes
        const orders = [
          {
            id: 'order-1',
            orderNumber: 'TR20241225001',
            status: 'DEMANDE',
            createdAt: new Date(),
            expediteur: {
              user: { firstName: 'Amadou', lastName: 'Diop' }
            },
            departureAddress: { city: 'Dakar', region: 'Dakar' },
            destinationAddress: { city: 'Thiès', region: 'Thiès' },
            quotes: []
          }
        ];

        mockPrisma.transportOrder.findMany.mockResolvedValue(orders);
        mockPrisma.transportOrder.count.mockResolvedValue(1);

        const response = await request(app)
          .get('/api/v1/transport/orders')
          .set('Authorization', `Bearer ${expediteurToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.pagination).toBeDefined();
      });

      test('✅ Filtrage par statut', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        mockPrisma.expediteur.findUnique.mockResolvedValue({ id: 'expediteur-123' });
        mockPrisma.transportOrder.findMany.mockResolvedValue([]);
        mockPrisma.transportOrder.count.mockResolvedValue(0);

        const response = await request(app)
          .get('/api/v1/transport/orders?status=EN_COURS&page=1&limit=10')
          .set('Authorization', `Bearer ${expediteurToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(mockPrisma.transportOrder.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              status: { in: ['EN_COURS'] }
            })
          })
        );
      });
    });

    describe('GET /api/v1/transport/orders/:id', () => {
      test('✅ Détails commande valide', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        const orderDetails = {
          id: 'order-123',
          orderNumber: 'TR20241225001',
          expediteurId: 'expediteur-123',
          expediteur: {
            user: { id: 'expediteur-user-123', firstName: 'Amadou', lastName: 'Diop' }
          },
          departureAddress: transportTestData.validAddress,
          destinationAddress: transportTestData.validAddress,
          quotes: [],
          trackingEvents: [],
          reviews: []
        };

        mockPrisma.transportOrder.findUnique.mockResolvedValue(orderDetails);

        const response = await request(app)
          .get('/api/v1/transport/orders/order-123')
          .set('Authorization', `Bearer ${expediteurToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.order.orderNumber).toBe('TR20241225001');
      });

      test('❌ Commande inexistante', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        mockPrisma.transportOrder.findUnique.mockResolvedValue(null);

        const response = await request(app)
          .get('/api/v1/transport/orders/inexistant')
          .set('Authorization', `Bearer ${expediteurToken}`)
          .expect(404);

        expect(response.body.success).toBe(false);
      });
    });

    describe('PATCH /api/v1/transport/orders/:id/status', () => {
      test('✅ Démarrage commande par transporteur', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        // Mock: commande confirmée
        const order = {
          id: 'order-123',
          status: 'CONFIRME',
          transporteurId: 'transporteur-123',
          vehicleId: 'vehicle-123',
          expediteurId: 'expediteur-123',
          departureAddress: { city: 'Dakar' },
          destinationAddress: { city: 'Thiès' }
        };

        mockPrisma.transportOrder.findUnique.mockResolvedValue(order);
        mockPrisma.transporteur.findUnique.mockResolvedValue({
          id: 'transporteur-123',
          userId: 'transporteur-user-123'
        });

        // Mock: transaction de mise à jour
        mockPrisma.$transaction.mockImplementation(async (callback) => {
          return await callback({
            transportOrder: {
              update: jest.fn().mockResolvedValue({
                ...order,
                status: 'EN_TRANSIT',
                startedAt: new Date()
              })
            },
            vehicle: {
              update: jest.fn().mockResolvedValue({})
            }
          });
        });

        const response = await request(app)
          .patch('/api/v1/transport/orders/order-123/start')
          .set('Authorization', `Bearer ${transporteurToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('démarré');
      });

      test('❌ Démarrage commande non confirmée', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        // Mock: commande en attente
        const order = {
          id: 'order-123',
          status: 'DEMANDE',
          transporteurId: 'transporteur-123'
        };

        mockPrisma.transportOrder.findUnique.mockResolvedValue(order);
        mockPrisma.transporteur.findUnique.mockResolvedValue({
          id: 'transporteur-123',
          userId: 'transporteur-user-123'
        });

        const response = await request(app)
          .patch('/api/v1/transport/orders/order-123/start')
          .set('Authorization', `Bearer ${transporteurToken}`)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('confirmées');
      });
    });
  });

  // ============ TESTS VÉHICULES ============

  describe('🚚 Gestion des Véhicules', () => {
    describe('POST /api/v1/transport/vehicles', () => {
      test('✅ Création véhicule valide', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        // Mock: transporteur existe
        mockPrisma.transporteur.findUnique.mockResolvedValue({
          id: 'transporteur-123'
        });

        // Mock: pas de véhicule avec cette plaque
        mockPrisma.vehicle.findUnique.mockResolvedValue(null);

        // Mock: création véhicule
        const createdVehicle = {
          id: 'vehicle-123',
          transporteurId: 'transporteur-123',
          ...transportTestData.validVehicle,
          status: 'DISPONIBLE',
          images: [],
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        mockPrisma.vehicle.create.mockResolvedValue(createdVehicle);

        const response = await request(app)
          .post('/api/v1/transport/vehicles')
          .set('Authorization', `Bearer ${transporteurToken}`)
          .send(transportTestData.validVehicle)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.vehicle.plateNumber).toBe(transportTestData.validVehicle.plateNumber);
        expect(response.body.data.vehicle.status).toBe('DISPONIBLE');
      });

      test('❌ Création véhicule plaque existante', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        mockPrisma.transporteur.findUnique.mockResolvedValue({ id: 'transporteur-123' });
        
        // Mock: véhicule avec plaque existante
        mockPrisma.vehicle.findUnique.mockResolvedValue({
          id: 'existing-vehicle',
          plateNumber: transportTestData.validVehicle.plateNumber
        });

        const response = await request(app)
          .post('/api/v1/transport/vehicles')
          .set('Authorization', `Bearer ${transporteurToken}`)
          .send(transportTestData.validVehicle)
          .expect(409);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('existe déjà');
      });

      test('❌ Création véhicule par expéditeur (non autorisé)', async () => {
        const response = await request(app)
          .post('/api/v1/transport/vehicles')
          .set('Authorization', `Bearer ${expediteurToken}`)
          .send(transportTestData.validVehicle)
          .expect(403);

        expect(response.body.success).toBe(false);
      });
    });

    describe('GET /api/v1/transport/vehicles', () => {
      test('✅ Liste véhicules transporteur', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        const vehicles = [
          {
            id: 'vehicle-1',
            type: 'CAMION_10T',
            brand: 'Mercedes',
            model: 'Actros',
            plateNumber: 'DK-1234-AB',
            status: 'DISPONIBLE',
            maintenanceRecords: []
          }
        ];

        mockPrisma.vehicle.findMany.mockResolvedValue(vehicles);
        mockPrisma.vehicle.count.mockResolvedValue(1);

        const response = await request(app)
          .get('/api/v1/transport/vehicles')
          .set('Authorization', `Bearer ${transporteurToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.pagination).toBeDefined();
      });

      test('✅ Filtrage véhicules par type et statut', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        mockPrisma.vehicle.findMany.mockResolvedValue([]);
        mockPrisma.vehicle.count.mockResolvedValue(0);

        const response = await request(app)
          .get('/api/v1/transport/vehicles?type=CAMION_10T&status=DISPONIBLE')
          .set('Authorization', `Bearer ${transporteurToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(mockPrisma.vehicle.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              type: 'CAMION_10T',
              status: 'DISPONIBLE'
            })
          })
        );
      });
    });

    describe('PATCH /api/v1/transport/vehicles/:id/status', () => {
      test('✅ Changement statut véhicule valide', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        // Mock: véhicule existe et appartient au transporteur
        const vehicle = {
          id: 'vehicle-123',
          transporteurId: 'transporteur-123',
          status: 'DISPONIBLE'
        };

        mockPrisma.vehicle.findFirst.mockResolvedValue(vehicle);
        mockPrisma.vehicle.update.mockResolvedValue({
          ...vehicle,
          status: 'MAINTENANCE'
        });

        const response = await request(app)
          .patch('/api/v1/transport/vehicles/vehicle-123/status')
          .set('Authorization', `Bearer ${transporteurToken}`)
          .send({ status: 'MAINTENANCE' })
          .expect(200);

        expect(response.body.success).toBe(true);
      });

      test('❌ Transition statut invalide', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        // Mock: véhicule en cours
        const vehicle = {
          id: 'vehicle-123',
          transporteurId: 'transporteur-123',
          status: 'EN_COURS'
        };

        mockPrisma.vehicle.findFirst.mockResolvedValue(vehicle);

        const response = await request(app)
          .patch('/api/v1/transport/vehicles/vehicle-123/status')
          .set('Authorization', `Bearer ${transporteurToken}`)
          .send({ status: 'MAINTENANCE' }) // Transition non autorisée
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('non autorisée');
      });
    });
  });

  // ============ TESTS DEVIS ============

  describe('💰 Gestion des Devis', () => {
    describe('POST /api/v1/transport/quotes', () => {
      test('✅ Création devis manuel', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        // Mock: transporteur valide
        mockPrisma.transporteur.findUnique.mockResolvedValue({
          id: 'transporteur-123',
          userId: 'transporteur-user-123'
        });

        // Mock: commande valide
        mockPrisma.transportOrder.findUnique.mockResolvedValue({
          id: 'order-123',
          status: 'DEMANDE'
        });

        // Mock: pas de devis existant
        mockPrisma.quote.findFirst.mockResolvedValue(null);

        // Mock: création devis
        const createdQuote = {
          id: 'quote-123',
          quoteNumber: 'DV20241225001',
          transportOrderId: 'order-123',
          transporteurId: 'transporteur-123',
          ...transportTestData.validQuote,
          status: 'BROUILLON',
          createdAt: new Date()
        };

        mockPrisma.quote.create.mockResolvedValue(createdQuote);

        const response = await request(app)
          .post('/api/v1/transport/quotes')
          .set('Authorization', `Bearer ${transporteurToken}`)
          .send({
            transportOrderId: 'order-123',
            calculation: transportTestData.validQuote,
            validUntil: transportTestData.validQuote.validUntil,
            paymentTerms: transportTestData.validQuote.paymentTerms
          })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.quote.quoteNumber).toBeDefined();
        expect(response.body.data.quote.status).toBe('BROUILLON');
      });

      test('❌ Devis déjà existant pour cette commande', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        mockPrisma.transporteur.findUnique.mockResolvedValue({
          id: 'transporteur-123',
          userId: 'transporteur-user-123'
        });

        mockPrisma.transportOrder.findUnique.mockResolvedValue({
          id: 'order-123',
          status: 'DEMANDE'
        });

        // Mock: devis déjà existant
        mockPrisma.quote.findFirst.mockResolvedValue({
          id: 'existing-quote-123'
        });

        const response = await request(app)
          .post('/api/v1/transport/quotes')
          .set('Authorization', `Bearer ${transporteurToken}`)
          .send({
            transportOrderId: 'order-123',
            calculation: transportTestData.validQuote
          })
          .expect(409);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('déjà été soumis');
      });
    });

    describe('POST /api/v1/transport/quotes/auto', () => {
      test('✅ Génération devis automatique', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        // Mock: transporteur avec véhicule adapté
        mockPrisma.transporteur.findUnique.mockResolvedValue({
          id: 'transporteur-123',
          userId: 'transporteur-user-123'
        });

        // Mock: commande valide
        mockPrisma.transportOrder.findUnique.mockResolvedValue({
          id: 'order-123',
          status: 'DEMANDE',
          goodsType: 'MATERIAUX_CONSTRUCTION',
          weight: 5000,
          estimatedDistance: 250
        });

        // Mock: véhicule adapté
        mockPrisma.vehicle.findFirst.mockResolvedValue({
          id: 'vehicle-123',
          type: 'CAMION_10T',
          capacity: 10
        });

        // Mock: pas de devis existant
        mockPrisma.quote.findFirst.mockResolvedValue(null);

        // Mock: création devis auto
        const autoQuote = {
          id: 'auto-quote-123',
          quoteNumber: 'DV20241225002',
          status: 'BROUILLON',
          totalPrice: 306800
        };

        mockPrisma.quote.create.mockResolvedValue(autoQuote);

        const response = await request(app)
          .post('/api/v1/transport/quotes/auto')
          .set('Authorization', `Bearer ${transporteurToken}`)
          .send({
            orderId: 'order-123',
            vehicleId: 'vehicle-123'
          })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.quote.totalPrice).toBeDefined();
      });
    });

    describe('POST /api/v1/transport/quotes/:id/send', () => {
      test('✅ Envoi devis valide', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        // Mock: devis en brouillon
        const quote = {
          id: 'quote-123',
          transporteurId: 'transporteur-123',
          status: 'BROUILLON',
          validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Valide 7 jours
          transportOrderId: 'order-123'
        };

        mockPrisma.quote.findUnique.mockResolvedValue(quote);
        mockPrisma.transporteur.findFirst.mockResolvedValue({
          id: 'transporteur-123',
          userId: 'transporteur-user-123'
        });

        // Mock: mise à jour statut
        mockPrisma.quote.update.mockResolvedValue({
          ...quote,
          status: 'ENVOYE',
          sentAt: new Date()
        });

        mockPrisma.transportOrder.update.mockResolvedValue({});

        const response = await request(app)
          .post('/api/v1/transport/quotes/quote-123/send')
          .set('Authorization', `Bearer ${transporteurToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('envoyé');
      });

      test('❌ Envoi devis déjà envoyé', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        // Mock: devis déjà envoyé
        const quote = {
          id: 'quote-123',
          transporteurId: 'transporteur-123',
          status: 'ENVOYE'
        };

        mockPrisma.quote.findUnique.mockResolvedValue(quote);
        mockPrisma.transporteur.findFirst.mockResolvedValue({
          id: 'transporteur-123',
          userId: 'transporteur-user-123'
        });

        const response = await request(app)
          .post('/api/v1/transport/quotes/quote-123/send')
          .set('Authorization', `Bearer ${transporteurToken}`)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('brouillon');
      });
    });

    describe('POST /api/v1/transport/quotes/:id/accept', () => {
      test('✅ Acceptation devis par expéditeur', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        // Mock: expediteur valide
        mockPrisma.expediteur.findUnique.mockResolvedValue({
          id: 'expediteur-123',
          userId: 'expediteur-user-123'
        });

        // Mock: devis valide et envoyé
        const quote = {
          id: 'quote-123',
          status: 'ENVOYE',
          validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // Valide encore 24h
          transportOrderId: 'order-123',
          transporteurId: 'transporteur-123',
          vehicleId: 'vehicle-123',
          totalPrice: 306800,
          transportOrder: {
            id: 'order-123',
            expediteurId: 'expediteur-123'
          }
        };

        mockPrisma.quote.findUnique.mockResolvedValue(quote);

        // Mock: transaction acceptation
        mockPrisma.$transaction.mockImplementation(async (callback) => {
          return await callback({
            quote: {
              update: jest.fn().mockResolvedValue({
                ...quote,
                status: 'ACCEPTE',
                respondedAt: new Date()
              })
            },
            transportOrder: {
              update: jest.fn().mockResolvedValue({
                id: 'order-123',
                status: 'DEVIS_ACCEPTE',
                transporteurId: 'transporteur-123',
                vehicleId: 'vehicle-123',
                totalPrice: 306800
              })
            }
          });
        });

        const response = await request(app)
          .post('/api/v1/transport/quotes/quote-123/accept')
          .set('Authorization', `Bearer ${expediteurToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.quote.status).toBe('ACCEPTE');
      });

      test('❌ Acceptation devis expiré', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        mockPrisma.expediteur.findUnique.mockResolvedValue({
          id: 'expediteur-123',
          userId: 'expediteur-user-123'
        });

        // Mock: devis expiré
        const expiredQuote = {
          id: 'quote-123',
          status: 'ENVOYE',
          validUntil: new Date(Date.now() - 24 * 60 * 60 * 1000), // Expiré depuis 24h
          transportOrder: {
            expediteurId: 'expediteur-123'
          }
        };

        mockPrisma.quote.findUnique.mockResolvedValue(expiredQuote);

        const response = await request(app)
          .post('/api/v1/transport/quotes/quote-123/accept')
          .set('Authorization', `Bearer ${expediteurToken}`)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('expiré');
      });
    });
  });

  // ============ TESTS SUIVI GPS ============

  describe('📍 Suivi GPS et Tracking', () => {
    describe('POST /api/v1/transport/tracking/:orderId/position', () => {
      test('✅ Mise à jour position en temps réel', async () => {
        const mockPrisma = require('../src/config/database').default;
        const mockRedisUtils = require('../src/config/redis').redisUtils;
        
        // Mock: commande en transit
        const order = {
          id: 'order-123',
          status: 'EN_TRANSIT',
          transporteurId: 'transporteur-123',
          destinationAddress: {
            latitude: 14.6928,
            longitude: -17.4467
          }
        };

        mockPrisma.transportOrder.findUnique.mockResolvedValue(order);
        mockPrisma.transporteur.findFirst.mockResolvedValue({
          id: 'transporteur-123',
          userId: 'transporteur-user-123'
        });

        // Mock: cache Redis
        mockRedisUtils.setWithExpiry.mockResolvedValue('OK');

        const positionData = {
          latitude: 14.7500,
          longitude: -17.3000,
          timestamp: new Date(),
          speed: 45,
          heading: 180
        };

        const response = await request(app)
          .post('/api/v1/transport/tracking/order-123/position')
          .set('Authorization', `Bearer ${transporteurToken}`)
          .send(positionData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.distanceRemaining).toBeDefined();
        expect(response.body.data.estimatedArrival).toBeDefined();
      });

      test('❌ Mise à jour position commande non en transit', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        // Mock: commande en attente
        const order = {
          id: 'order-123',
          status: 'DEMANDE',
          transporteurId: 'transporteur-123'
        };

        mockPrisma.transportOrder.findUnique.mockResolvedValue(order);
        mockPrisma.transporteur.findFirst.mockResolvedValue({
          id: 'transporteur-123',
          userId: 'transporteur-user-123'
        });

        const response = await request(app)
          .post('/api/v1/transport/tracking/order-123/position')
          .set('Authorization', `Bearer ${transporteurToken}`)
          .send({
            latitude: 14.7500,
            longitude: -17.3000,
            timestamp: new Date()
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('en transit');
      });
    });

    describe('GET /api/v1/transport/tracking/:orderId/current', () => {
      test('✅ Récupération position actuelle', async () => {
        const mockPrisma = require('../src/config/database').default;
        const mockRedisUtils = require('../src/config/redis').redisUtils;
        
        // Mock: accès utilisateur valide
        mockPrisma.transportOrder.findUnique.mockResolvedValue({
          id: 'order-123',
          expediteur: { userId: 'expediteur-user-123' }
        });

        // Mock: position en cache
        const positionData = {
          latitude: 14.7500,
          longitude: -17.3000,
          timestamp: new Date().toISOString(),
          speed: 45
        };

        mockRedisUtils.get.mockResolvedValueOnce(JSON.stringify(positionData));
        mockRedisUtils.get.mockResolvedValueOnce(JSON.stringify({
          distanceRemaining: 15.5,
          estimatedArrival: new Date(Date.now() + 30 * 60 * 1000)
        }));

        const response = await request(app)
          .get('/api/v1/transport/tracking/order-123/current')
          .set('Authorization', `Bearer ${expediteurToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.position).toBeDefined();
        expect(response.body.data.distanceRemaining).toBeDefined();
      });

      test('❌ Accès position sans autorisation', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        // Mock: commande d'un autre expéditeur
        mockPrisma.transportOrder.findUnique.mockResolvedValue({
          id: 'order-123',
          expediteur: { userId: 'autre-expediteur-123' }
        });

        const response = await request(app)
          .get('/api/v1/transport/tracking/order-123/current')
          .set('Authorization', `Bearer ${expediteurToken}`)
          .expect(403);

        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/v1/transport/tracking/:orderId/events', () => {
      test('✅ Création événement de tracking', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        // Mock: commande valide
        mockPrisma.transportOrder.findFirst.mockResolvedValue({
          id: 'order-123',
          transporteurId: 'transporteur-123'
        });

        mockPrisma.transporteur.findFirst.mockResolvedValue({
          id: 'transporteur-123',
          userId: 'transporteur-user-123'
        });

        // Mock: création événement
        const trackingEvent = {
          id: 'event-123',
          transportOrderId: 'order-123',
          eventType: 'PICKUP',
          location: 'Entrepôt Dakar',
          description: 'Marchandise chargée',
          timestamp: new Date()
        };

        mockPrisma.trackingEvent.create.mockResolvedValue(trackingEvent);

        const response = await request(app)
          .post('/api/v1/transport/tracking/order-123/events')
          .set('Authorization', `Bearer ${transporteurToken}`)
          .send({
            eventType: 'PICKUP',
            location: 'Entrepôt Dakar',
            description: 'Marchandise chargée',
            coordinates: { latitude: 14.6928, longitude: -17.4467 },
            images: ['proof1.jpg', 'proof2.jpg']
          })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.trackingEvent.eventType).toBe('PICKUP');
      });
    });
  });

  // ============ TESTS RECHERCHE ============

  describe('🔍 Recherche et Filtrage', () => {
    describe('GET /api/v1/transport/search/orders', () => {
      test('✅ Recherche commandes avec filtres', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        // Mock: transporteur valide pour accès
        mockPrisma.transporteur.findUnique.mockResolvedValue({
          id: 'transporteur-123'
        });

        // Mock: résultats de recherche
        const searchResults = [
          {
            id: 'order-1',
            orderNumber: 'TR20241225001',
            goodsType: 'MATERIAUX_CONSTRUCTION',
            weight: 5000,
            departureAddress: { city: 'Dakar', region: 'Dakar' },
            destinationAddress: { city: 'Thiès', region: 'Thiès' },
            expediteur: {
              user: { firstName: 'Amadou', lastName: 'Diop' }
            },
            quotes: []
          }
        ];

        mockPrisma.transportOrder.findMany.mockResolvedValue(searchResults);
        mockPrisma.transportOrder.count.mockResolvedValue(1);

        // Mock: agrégations
        mockPrisma.transportOrder.groupBy.mockResolvedValue([
          { goodsType: 'MATERIAUX_CONSTRUCTION', _count: { id: 1 } }
        ]);
        mockPrisma.transportOrder.aggregate.mockResolvedValue({
          _avg: { totalPrice: 300000 },
          _min: { totalPrice: 200000 },
          _max: { totalPrice: 400000 }
        });

        const response = await request(app)
          .get('/api/v1/transport/search/orders?goodsType=MATERIAUX_CONSTRUCTION&minWeight=1000&maxWeight=10000')
          .set('Authorization', `Bearer ${transporteurToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.aggregations).toBeDefined();
      });
    });

    describe('GET /api/v1/transport/search/transporteurs', () => {
      test('✅ Recherche transporteurs disponibles', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        const transporteurs = [
          {
            id: 'transporteur-1',
            companyName: 'Transport Ba SARL',
            rating: 4.5,
            verified: true,
            isOnline: true,
            user: {
              firstName: 'Ousmane',
              lastName: 'Ba',
              phone: '+221771234567'
            },
            vehicles: [
              {
                id: 'vehicle-1',
                type: 'CAMION_10T',
                capacity: 10,
                status: 'DISPONIBLE'
              }
            ],
            reviews: []
          }
        ];

        mockPrisma.transporteur.findMany.mockResolvedValue(transporteurs);
        mockPrisma.transporteur.count.mockResolvedValue(1);

        const response = await request(app)
          .get('/api/v1/transport/search/transporteurs?vehicleTypes=CAMION_10T&minRating=4.0&verifiedOnly=true')
          .set('Authorization', `Bearer ${expediteurToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].verified).toBe(true);
      });
    });

    describe('GET /api/v1/transport/search/intelligent', () => {
      test('✅ Recherche intelligente multi-entités', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        // Mock: résultats de recherche
        mockPrisma.transportOrder.findMany.mockResolvedValue([]);
        mockPrisma.transporteur.findMany.mockResolvedValue([]);
        mockPrisma.vehicle.findMany.mockResolvedValue([]);

        const response = await request(app)
          .get('/api/v1/transport/search/intelligent?q=Dakar Thiès matériaux')
          .set('Authorization', `Bearer ${expediteurToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.orders).toBeDefined();
        expect(response.body.data.transporteurs).toBeDefined();
        expect(response.body.data.vehicles).toBeDefined();
        expect(response.body.data.suggestions).toBeDefined();
      });
    });
  });

  // ============ TESTS ÉVALUATIONS ============

  describe('⭐ Système d'Évaluations', () => {
    describe('POST /api/v1/transport/reviews', () => {
      test('✅ Création évaluation par expéditeur', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        // Mock: commande terminée
        const order = {
          id: 'order-123',
          status: 'LIVRE',
          expediteurId: 'expediteur-123',
          transporteurId: 'transporteur-123',
          expediteur: { user: { id: 'expediteur-user-123' } }
        };

        mockPrisma.transportOrder.findUnique.mockResolvedValue(order);

        // Mock: pas d'évaluation existante
        mockPrisma.review.findFirst.mockResolvedValue(null);

        // Mock: création évaluation
        const review = {
          id: 'review-123',
          transportOrderId: 'order-123',
          transporteurId: 'transporteur-123',
          reviewerType: 'EXPEDITEUR',
          overallRating: 5,
          punctualityRating: 5,
          communicationRating: 4,
          comment: 'Excellent service, très professionnel',
          isVerified: true,
          createdAt: new Date()
        };

        mockPrisma.review.create.mockResolvedValue(review);

        const response = await request(app)
          .post('/api/v1/transport/reviews')
          .set('Authorization', `Bearer ${expediteurToken}`)
          .send({
            transportOrderId: 'order-123',
            overallRating: 5,
            punctualityRating: 5,
            communicationRating: 4,
            vehicleConditionRating: 5,
            professionalismRating: 5,
            comment: 'Excellent service, très professionnel',
            pros: 'Ponctuel, véhicule propre',
            cons: 'Communication pourrait être améliorée',
            isPublic: true
          })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.review.overallRating).toBe(5);
      });

      test('❌ Évaluation commande non terminée', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        // Mock: commande en cours
        const order = {
          id: 'order-123',
          status: 'EN_TRANSIT',
          expediteurId: 'expediteur-123',
          expediteur: { user: { id: 'expediteur-user-123' } }
        };

        mockPrisma.transportOrder.findUnique.mockResolvedValue(order);

        const response = await request(app)
          .post('/api/v1/transport/reviews')
          .set('Authorization', `Bearer ${expediteurToken}`)
          .send({
            transportOrderId: 'order-123',
            overallRating: 5
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('livrées');
      });
    });

    describe('GET /api/v1/transport/reviews/transporteur/:id', () => {
      test('✅ Récupération évaluations transporteur', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        const reviews = [
          {
            id: 'review-1',
            overallRating: 5,
            comment: 'Excellent service',
            isPublic: true,
            createdAt: new Date(),
            transportOrder: {
              orderNumber: 'TR20241225001',
              completedAt: new Date(),
              departureAddress: { city: 'Dakar' },
              destinationAddress: { city: 'Thiès' }
            }
          }
        ];

        mockPrisma.review.findMany.mockResolvedValue(reviews);
        mockPrisma.review.count.mockResolvedValue(1);

        const response = await request(app)
          .get('/api/v1/transport/reviews/transporteur/transporteur-123')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);
      });
    });

    describe('GET /api/v1/transport/reviews/transporteur/:id/stats', () => {
      test('✅ Statistiques évaluations transporteur', async () => {
        const mockPrisma = require('../src/config/database').default;
        
        const reviews = [
          { overallRating: 5, punctualityRating: 5, communicationRating: 4 },
          { overallRating: 4, punctualityRating: 4, communicationRating: 5 },
          { overallRating: 5, punctualityRating: 5, communicationRating: 5 }
        ];

        mockPrisma.review.findMany.mockResolvedValue(reviews);

        const response = await request(app)
          .get('/api/v1/transport/reviews/transporteur/transporteur-123/stats')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.overallRating).toBeCloseTo(4.67, 1);
        expect(response.body.data.totalReviews).toBe(3);
        expect(response.body.data.ratingDistribution).toBeDefined();
        expect(response.body.data.recommendationRate).toBeGreaterThan(0);
      });
    });
  });

  // ============ TESTS DE SÉCURITÉ ET PERFORMANCE ============

  describe('🔒 Tests de Sécurité', () => {
    test('❌ Accès endpoints sans authentification', async () => {
      const endpoints = [
        'GET /api/v1/transport/orders',
        'POST /api/v1/transport/orders',
        'GET /api/v1/transport/vehicles',
        'POST /api/v1/transport/quotes'
      ];

      for (const endpoint of endpoints) {
        const [method, path] = endpoint.split(' ');
        const response = await request(app)[method.toLowerCase()](path);
        expect(response.status).toBe(401);
      }
    });

    test('❌ Tentative accès données autre utilisateur', async () => {
      const mockPrisma = require('../src/config/database').default;
      
      // Mock: commande appartenant à un autre expéditeur
      mockPrisma.transportOrder.findUnique.mockResolvedValue({
        id: 'order-123',
        expediteur: { userId: 'autre-expediteur-123' }
      });

      const response = await request(app)
        .get('/api/v1/transport/orders/order-123')
        .set('Authorization', `Bearer ${expediteurToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    test('❌ Injection SQL dans paramètres', async () => {
      const response = await request(app)
        .get("/api/v1/transport/orders?status='; DROP TABLE orders; --")
        .set('Authorization', `Bearer ${expediteurToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('⚡ Tests de Performance', () => {
    test('⏱️ Temps de réponse liste commandes < 300ms', async () => {
      const mockPrisma = require('../src/config/database').default;
      
      mockPrisma.expediteur.findUnique.mockResolvedValue({ id: 'expediteur-123' });
      mockPrisma.transportOrder.findMany.mockResolvedValue([]);
      mockPrisma.transportOrder.count.mockResolvedValue(0);

      const startTime = Date.now();
      
      await request(app)
        .get('/api/v1/transport/orders')
        .set('Authorization', `Bearer ${expediteurToken}`)
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(300);
    });

    test('⏱️ Temps de réponse recherche < 500ms', async () => {
      const mockPrisma = require('../src/config/database').default;
      
      mockPrisma.transporteur.findUnique.mockResolvedValue({ id: 'transporteur-123' });
      mockPrisma.transportOrder.findMany.mockResolvedValue([]);
      mockPrisma.transportOrder.count.mockResolvedValue(0);
      mockPrisma.transportOrder.groupBy.mockResolvedValue([]);
      mockPrisma.transportOrder.aggregate.mockResolvedValue({
        _avg: { totalPrice: null },
        _min: { totalPrice: null },
        _max: { totalPrice: null }
      });

      const startTime = Date.now();
      
      await request(app)
        .get('/api/v1/transport/search/orders?goodsType=MATERIAUX_CONSTRUCTION')
        .set('Authorization', `Bearer ${transporteurToken}`)
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(500);
    });
  });
});