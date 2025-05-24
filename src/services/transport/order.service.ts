import { TransportOrderStatus, GoodsType, VehicleType, VehicleStatus } from '@prisma/client';
import { 
  CreateTransportOrderData,
  TransportOrderResponse,
  TransportSearchFilters,
  PaginatedResponse,
  AddressInfo,
  DistanceMatrix,
  DEFAULT_PRICING
} from '@/types/transport.types';
import { 
  NotFoundError, 
  ValidationError, 
  ConflictError,
  AuthorizationError 
} from '@/middleware/errorHandler';
import prisma from '@/config/database';
import crypto from 'crypto';

// ============ SERVICE COMMANDES TRANSPORT ============

export class TransportOrderService {

  // ============ OPÉRATIONS CRUD ============

  /**
   * Créer une nouvelle commande de transport
   */
  async createOrder(expediteurId: string, data: CreateTransportOrderData): Promise<TransportOrderResponse> {
    // Vérifier que l'expéditeur existe
    const expediteur = await prisma.expediteur.findUnique({
      where: { id: expediteurId },
      include: { user: true }
    });

    if (!expediteur) {
      throw new NotFoundError('Expéditeur');
    }

    // Valider les adresses
    await this.validateAddresses(data.departureAddressId, data.destinationAddressId, expediteur.userId);

    // Générer un numéro de commande unique
    const orderNumber = await this.generateOrderNumber();

    // Calculer la distance si possible
    const distanceInfo = await this.calculateDistanceForOrder(
      data.departureAddressId, 
      data.destinationAddressId
    );

    // Calculer le prix de base
    const basePrice = this.calculateBasePrice(data.weight, distanceInfo?.distance, data.goodsType);

    // Créer la commande
    const order = await prisma.transportOrder.create({
      data: {
        orderNumber,
        expediteurId,
        
        // Adresses
        departureAddressId: data.departureAddressId,
        destinationAddressId: data.destinationAddressId,
        
        // Planification
        departureDate: data.departureDate,
        departureTime: data.departureTime,
        deliveryDate: data.deliveryDate,
        deliveryTime: data.deliveryTime,
        
        // Marchandise
        goodsType: data.goodsType,
        goodsDescription: data.goodsDescription,
        weight: data.weight,
        volume: data.volume,
        quantity: data.quantity,
        packagingType: data.packagingType,
        specialRequirements: data.specialRequirements,
        declaredValue: data.declaredValue,
        
        // Calculs
        estimatedDistance: distanceInfo?.distance,
        estimatedDuration: distanceInfo?.duration,
        basePrice,
        totalPrice: basePrice,
        
        // Autres
        priority: data.priority,
        notes: data.notes,
        departureContact: data.departureContact,
        destinationContact: data.destinationContact,
        departureInstructions: data.departureInstructions,
        deliveryInstructions: data.deliveryInstructions,
        
        status: TransportOrderStatus.DEMANDE
      }
    });

    // Mettre à jour les statistiques de l'expéditeur
    await this.updateExpediteurStats(expediteurId);

    return await this.getOrderById(order.id);
  }

  /**
   * Récupérer une commande par ID
   */
  async getOrderById(id: string, userId?: string): Promise<TransportOrderResponse> {
    const order = await prisma.transportOrder.findUnique({
      where: { id },
      include: {
        expediteur: {
          include: { user: true }
        },
        transporteur: {
          include: { user: true }
        },
        vehicle: true,
        departureAddress: true,
        destinationAddress: true,
        quotes: {
          where: { status: { not: 'BROUILLON' } },
          orderBy: { totalPrice: 'asc' },
          take: 5
        },
        trackingEvents: {
          where: { isPublic: true },
          orderBy: { timestamp: 'desc' },
          take: 10
        },
        reviews: {
          where: { isPublic: true }
        }
      }
    });

    if (!order) {
      throw new NotFoundError('Commande de transport');
    }

    // Vérifier les permissions si userId fourni
    if (userId) {
      await this.checkOrderAccess(order, userId);
    }

    return this.formatOrderResponse(order);
  }

  /**
   * Lister les commandes selon le rôle de l'utilisateur
   */
  async getOrdersByUser(
    userId: string, 
    userRole: string,
    filters: {
      status?: TransportOrderStatus[];
      page?: number;
      limit?: number;
      sortBy?: 'date' | 'price' | 'status';
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<PaginatedResponse<TransportOrderResponse>> {
    const { page = 1, limit = 10, sortBy = 'date', sortOrder = 'desc', ...searchFilters } = filters;
    const skip = (page - 1) * limit;

    // Construire les conditions selon le rôle
    let whereCondition: any = {};

    if (userRole === 'EXPEDITEUR') {
      const expediteur = await prisma.expediteur.findUnique({
        where: { userId },
        select: { id: true }
      });
      
      if (!expediteur) {
        throw new AuthorizationError('Profil expéditeur non trouvé');
      }
      
      whereCondition.expediteurId = expediteur.id;
    } else if (userRole === 'TRANSPORTEUR') {
      const transporteur = await prisma.transporteur.findUnique({
        where: { userId },
        select: { id: true }
      });
      
      if (!transporteur) {
        throw new AuthorizationError('Profil transporteur non trouvé');
      }
      
      whereCondition.transporteurId = transporteur.id;
    }

    // Ajouter les filtres
    if (searchFilters.status && searchFilters.status.length > 0) {
      whereCondition.status = { in: searchFilters.status };
    }

    // Définir l'ordre de tri
    let orderBy: any = {};
    switch (sortBy) {
      case 'date':
        orderBy = { createdAt: sortOrder };
        break;
      case 'price':
        orderBy = { totalPrice: sortOrder };
        break;
      case 'status':
        orderBy = { status: sortOrder };
        break;
      default:
        orderBy = { createdAt: 'desc' };
    }

    // Récupérer les commandes avec pagination
    const [orders, total] = await Promise.all([
      prisma.transportOrder.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy,
        include: {
          expediteur: {
            include: { user: { select: { firstName: true, lastName: true } } }
          },
          transporteur: {
            include: { user: { select: { firstName: true, lastName: true } } }
          },
          vehicle: {
            select: { type: true, brand: true, model: true, plateNumber: true }
          },
          departureAddress: true,
          destinationAddress: true,
          quotes: {
            where: { status: 'ACCEPTE' },
            take: 1
          }
        }
      }),
      prisma.transportOrder.count({ where: whereCondition })
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: orders.map(order => this.formatOrderResponse(order)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }

  /**
   * Rechercher des commandes avec filtres avancés
   */
  async searchOrders(filters: TransportSearchFilters): Promise<PaginatedResponse<any>> {
    const { page = 1, limit = 10, sortBy = 'date', sortOrder = 'desc', ...searchFilters } = filters;
    const skip = (page - 1) * limit;

    // Construire les conditions de recherche
    const whereCondition: any = {
      status: {
        in: [
          TransportOrderStatus.DEMANDE,
          TransportOrderStatus.DEVIS_ENVOYE,
          TransportOrderStatus.DEVIS_ACCEPTE
        ]
      }
    };

    // Filtres géographiques
    if (searchFilters.departureRegion || searchFilters.departureCity) {
      whereCondition.departureAddress = {};
      if (searchFilters.departureRegion) {
        whereCondition.departureAddress.region = searchFilters.departureRegion;
      }
      if (searchFilters.departureCity) {
        whereCondition.departureAddress.city = searchFilters.departureCity;
      }
    }

    if (searchFilters.destinationRegion || searchFilters.destinationCity) {
      whereCondition.destinationAddress = {};
      if (searchFilters.destinationRegion) {
        whereCondition.destinationAddress.region = searchFilters.destinationRegion;
      }
      if (searchFilters.destinationCity) {
        whereCondition.destinationAddress.city = searchFilters.destinationCity;
      }
    }

    // Filtres marchandise
    if (searchFilters.goodsType) {
      whereCondition.goodsType = searchFilters.goodsType;
    }

    if (searchFilters.minWeight || searchFilters.maxWeight) {
      whereCondition.weight = {};
      if (searchFilters.minWeight) {
        whereCondition.weight.gte = searchFilters.minWeight;
      }
      if (searchFilters.maxWeight) {
        whereCondition.weight.lte = searchFilters.maxWeight;
      }
    }

    // Filtres dates
    if (searchFilters.departureDateFrom || searchFilters.departureDateTo) {
      whereCondition.departureDate = {};
      if (searchFilters.departureDateFrom) {
        whereCondition.departureDate.gte = searchFilters.departureDateFrom;
      }
      if (searchFilters.departureDateTo) {
        whereCondition.departureDate.lte = searchFilters.departureDateTo;
      }
    }

    // Définir l'ordre de tri
    let orderBy: any = {};
    switch (sortBy) {
      case 'date':
        orderBy = { departureDate: sortOrder };
        break;
      case 'price':
        orderBy = { totalPrice: sortOrder };
        break;
      case 'distance':
        orderBy = { estimatedDistance: sortOrder };
        break;
      default:
        orderBy = { createdAt: 'desc' };
    }

    // Récupérer les commandes
    const [orders, total] = await Promise.all([
      prisma.transportOrder.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy,
        include: {
          expediteur: {
            include: { 
              user: { 
                select: { 
                  firstName: true, 
                  lastName: true, 
                  phone: true 
                } 
              } 
            }
          },
          departureAddress: true,
          destinationAddress: true
        }
      }),
      prisma.transportOrder.count({ where: whereCondition })
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: orders.map(order => ({
        id: order.id,
        orderNumber: order.orderNumber,
        goodsType: order.goodsType,
        goodsDescription: order.goodsDescription,
        weight: order.weight,
        volume: order.volume,
        departureDate: order.departureDate,
        departureTime: order.departureTime,
        deliveryDate: order.deliveryDate,
        priority: order.priority,
        estimatedDistance: order.estimatedDistance,
        estimatedDuration: order.estimatedDuration,
        totalPrice: order.totalPrice,
        status: order.status,
        departureAddress: {
          street: order.departureAddress.street,
          city: order.departureAddress.city,
          region: order.departureAddress.region
        },
        destinationAddress: {
          street: order.destinationAddress.street,
          city: order.destinationAddress.city,
          region: order.destinationAddress.region
        },
        expediteur: {
          name: `${order.expediteur.user.firstName} ${order.expediteur.user.lastName}`,
          phone: order.expediteur.user.phone
        },
        createdAt: order.createdAt
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }

  // ============ GESTION DU WORKFLOW ============

  /**
   * Assigner un transporteur et véhicule à une commande
   */
  async assignOrder(
    orderId: string,
    transporteurId: string,
    vehicleId: string,
    estimatedDelivery?: Date
  ): Promise<TransportOrderResponse> {
    // Vérifier que la commande existe et est assignable
    const order = await prisma.transportOrder.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      throw new NotFoundError('Commande de transport');
    }

    if (order.status !== TransportOrderStatus.DEVIS_ACCEPTE) {
      throw new ValidationError([{
        field: 'status',
        message: 'Seules les commandes avec devis accepté peuvent être assignées'
      }]);
    }

    // Vérifier que le véhicule appartient au transporteur et est disponible
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        transporteurId,
        status: VehicleStatus.DISPONIBLE,
        isActive: true
      }
    });

    if (!vehicle) {
      throw new NotFoundError('Véhicule disponible');
    }

    // Vérifier la capacité du véhicule
    if (order.weight > vehicle.capacity * 1000) { // capacity en tonnes, weight en kg
      throw new ValidationError([{
        field: 'vehicle',
        message: `Capacité insuffisante. Véhicule: ${vehicle.capacity}T, Commande: ${order.weight/1000}T`
      }]);
    }

    // Transaction pour assigner la commande
    const updatedOrder = await prisma.$transaction(async (tx) => {
      // Mettre à jour la commande
      const updated = await tx.transportOrder.update({
        where: { id: orderId },
        data: {
          transporteurId,
          vehicleId,
          status: TransportOrderStatus.CONFIRME,
          assignedAt: new Date(),
          deliveryDate: estimatedDelivery || order.deliveryDate
        }
      });

      // Changer le statut du véhicule
      await tx.vehicle.update({
        where: { id: vehicleId },
        data: { status: VehicleStatus.RESERVE }
      });

      return updated;
    });

    // Mettre à jour les statistiques du transporteur
    await this.updateTransporteurStats(transporteurId);

    return await this.getOrderById(updatedOrder.id);
  }

  /**
   * Démarrer une commande (passage en transit)
   */
  async startOrder(orderId: string, transporteurId: string): Promise<TransportOrderResponse> {
    const order = await this.validateOrderAccess(orderId, transporteurId, 'TRANSPORTEUR');

    if (order.status !== TransportOrderStatus.CONFIRME) {
      throw new ValidationError([{
        field: 'status',
        message: 'Seules les commandes confirmées peuvent être démarrées'
      }]);
    }

    // Mettre à jour le statut
    const updatedOrder = await prisma.$transaction(async (tx) => {
      const updated = await tx.transportOrder.update({
        where: { id: orderId },
        data: {
          status: TransportOrderStatus.EN_TRANSIT,
          startedAt: new Date()
        }
      });

      // Mettre le véhicule en cours
      if (order.vehicleId) {
        await tx.vehicle.update({
          where: { id: order.vehicleId },
          data: { status: VehicleStatus.EN_COURS }
        });
      }

      return updated;
    });

    return await this.getOrderById(updatedOrder.id);
  }

  /**
   * Terminer une commande (livraison)
   */
  async completeOrder(
    orderId: string, 
    transporteurId: string,
    completionData: {
      deliveryProof?: string[];
      signature?: string;
      notes?: string;
    }
  ): Promise<TransportOrderResponse> {
    const order = await this.validateOrderAccess(orderId, transporteurId, 'TRANSPORTEUR');

    if (order.status !== TransportOrderStatus.EN_TRANSIT) {
      throw new ValidationError([{
        field: 'status',
        message: 'Seules les commandes en transit peuvent être terminées'
      }]);
    }

    // Mettre à jour le statut
    const updatedOrder = await prisma.$transaction(async (tx) => {
      const updated = await tx.transportOrder.update({
        where: { id: orderId },
        data: {
          status: TransportOrderStatus.LIVRE,
          completedAt: new Date(),
          internalNotes: completionData.notes
        }
      });

      // Libérer le véhicule
      if (order.vehicleId) {
        await tx.vehicle.update({
          where: { id: order.vehicleId },
          data: { status: VehicleStatus.DISPONIBLE }
        });
      }

      // Créer un événement de tracking
      await tx.trackingEvent.create({
        data: {
          transportOrderId: orderId,
          eventType: 'DELIVERY',
          location: order.destinationAddress.city,
          address: `${order.destinationAddress.street}, ${order.destinationAddress.city}`,
          description: 'Livraison effectuée avec succès',
          images: completionData.deliveryProof || [],
          signature: completionData.signature,
          isPublic: true,
          timestamp: new Date()
        }
      });

      return updated;
    });

    // Mettre à jour les statistiques
    await this.updateTransporteurStats(transporteurId);
    await this.updateExpediteurStats(order.expediteurId);

    return await this.getOrderById(updatedOrder.id);
  }

  /**
   * Annuler une commande
   */
  async cancelOrder(
    orderId: string, 
    userId: string, 
    reason: string
  ): Promise<TransportOrderResponse> {
    const order = await prisma.transportOrder.findUnique({
      where: { id: orderId },
      include: {
        expediteur: { include: { user: true } },
        transporteur: { include: { user: true } }
      }
    });

    if (!order) {
      throw new NotFoundError('Commande de transport');
    }

    // Vérifier les permissions
    const canCancel = order.expediteur.user.id === userId || 
                     (order.transporteur && order.transporteur.user.id === userId);

    if (!canCancel) {
      throw new AuthorizationError('Seuls l\'expéditeur et le transporteur peuvent annuler');
    }

    // Vérifier si la commande peut être annulée
    if ([TransportOrderStatus.LIVRE, TransportOrderStatus.TERMINE].includes(order.status)) {
      throw new ValidationError([{
        field: 'status',
        message: 'Impossible d\'annuler une commande livrée ou terminée'
      }]);
    }

    // Annuler la commande
    const updatedOrder = await prisma.$transaction(async (tx) => {
      const updated = await tx.transportOrder.update({
        where: { id: orderId },
        data: {
          status: TransportOrderStatus.ANNULE,
          cancellationReason: reason,
          cancelledAt: new Date()
        }
      });

      // Libérer le véhicule si assigné
      if (order.vehicleId) {
        await tx.vehicle.update({
          where: { id: order.vehicleId },
          data: { status: VehicleStatus.DISPONIBLE }
        });
      }

      return updated;
    });

    return await this.getOrderById(updatedOrder.id);
  }

  // ============ MÉTHODES PRIVÉES ============

  /**
   * Valider que les adresses appartiennent à l'utilisateur
   */
  private async validateAddresses(
    departureAddressId: string, 
    destinationAddressId: string, 
    userId: string
  ): Promise<void> {
    const addresses = await prisma.address.findMany({
      where: {
        id: { in: [departureAddressId, destinationAddressId] },
        userId,
        isActive: true
      }
    });

    if (addresses.length !== 2) {
      throw new NotFoundError('Une ou plusieurs adresses non trouvées');
    }
  }

  /**
   * Générer un numéro de commande unique
   */
  private async generateOrderNumber(): Promise<string> {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    // Compter les commandes du jour
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    
    const todayCount = await prisma.transportOrder.count({
      where: {
        createdAt: {
          gte: startOfDay,
          lt: endOfDay
        }
      }
    });

    const sequence = (todayCount + 1).toString().padStart(4, '0');
    return `TR${year}${month}${day}${sequence}`;
  }

  /**
   * Calculer la distance entre deux adresses
   */
  private async calculateDistanceForOrder(
    departureAddressId: string,
    destinationAddressId: string
  ): Promise<DistanceMatrix | null> {
    try {
      const addresses = await prisma.address.findMany({
        where: { id: { in: [departureAddressId, destinationAddressId] } },
        select: { id: true, latitude: true, longitude: true }
      });

      const departure = addresses.find(a => a.id === departureAddressId);
      const destination = addresses.find(a => a.id === destinationAddressId);

      if (!departure?.latitude || !destination?.latitude) {
        return null;
      }

      // Calcul de distance simple (à remplacer par l'API Google Maps)
      const distance = this.calculateHaversineDistance(
        departure.latitude, departure.longitude,
        destination.latitude, destination.longitude
      );

      return {
        departure: { latitude: departure.latitude, longitude: departure.longitude },
        destination: { latitude: destination.latitude, longitude: destination.longitude },
        distance: Math.round(distance),
        duration: Math.round(distance / 60 * 60) // Estimation: 60 km/h moyenne
      };
    } catch (error) {
      console.error('Erreur calcul distance:', error);
      return null;
    }
  }

  /**
   * Calculer la distance Haversine entre deux points GPS
   */
  private calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Rayon de la Terre en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * Calculer le prix de base d'une commande
   */
  private calculateBasePrice(weight: number, distance?: number, goodsType?: GoodsType): number {
    let price = DEFAULT_PRICING.BASE_PRICE;

    // Prix basé sur la distance
    if (distance) {
      price += distance * DEFAULT_PRICING.PRICE_PER_KM;
    }

    // Prix basé sur le poids (en tonnes)
    const weightInTons = weight / 1000;
    price += weightInTons * DEFAULT_PRICING.PRICE_PER_TON;

    // Majoration selon le type de marchandise
    const goodsMultiplier: Record<string, number> = {
      PRODUITS_DANGEREUX: 1.5,
      LIQUIDES: 1.3,
      PRODUITS_CHIMIQUES: 1.4,
      VEHICULES: 1.2,
      BETAIL: 1.3
    };

    if (goodsType && goodsMultiplier[goodsType]) {
      price *= goodsMultiplier[goodsType];
    }

    return Math.round(price);
  }

  /**
   * Vérifier l'accès à une commande
   */
  private async checkOrderAccess(order: any, userId: string): Promise<void> {
    const hasAccess = order.expediteur.user.id === userId || 
                     (order.transporteur && order.transporteur.user.id === userId);

    if (!hasAccess) {
      throw new AuthorizationError('Accès interdit à cette commande');
    }
  }

  /**
   * Valider l'accès à une commande pour un transporteur
   */
  private async validateOrderAccess(orderId: string, transporteurId: string, role: string): Promise<any> {
    const order = await prisma.transportOrder.findUnique({
      where: { id: orderId },
      include: {
        expediteur: { include: { user: true } },
        transporteur: { include: { user: true } },
        departureAddress: true,
        destinationAddress: true
      }
    });

    if (!order) {
      throw new NotFoundError('Commande de transport');
    }

    if (role === 'TRANSPORTEUR' && order.transporteurId !== transporteurId) {
      throw new AuthorizationError('Cette commande n\'est pas assignée à ce transporteur');
    }

    return order;
  }

  /**
   * Mettre à jour les statistiques de l'expéditeur
   */
  private async updateExpediteurStats(expediteurId: string): Promise<void> {
    const stats = await prisma.transportOrder.groupBy({
      by: ['status'],
      where: { expediteurId },
      _count: { id: true }
    });

    const totalOrders = stats.reduce((sum, stat) => sum + stat._count.id, 0);

    await prisma.expediteur.update({
      where: { id: expediteurId },
      data: { totalOrders }
    });
  }

  /**
   * Mettre à jour les statistiques du transporteur
   */
  private async updateTransporteurStats(transporteurId: string): Promise<void> {
    const completedOrders = await prisma.transportOrder.count({
      where: {
        transporteurId,
        status: TransportOrderStatus.LIVRE
      }
    });

    const totalOrders = await prisma.transportOrder.count({
      where: { transporteurId }
    });

    const completionRate = totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;

    await prisma.transporteur.update({
      where: { id: transporteurId },
      data: {
        totalRides: totalOrders,
        completionRate
      }
    });
  }

  /**
   * Formater la réponse commande
   */
  private formatOrderResponse(order: any): TransportOrderResponse {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      expediteurId: order.expediteurId,
      transporteurId: order.transporteurId,
      vehicleId: order.vehicleId,
      status: order.status,
      
      // Adresses
      departureAddressId: order.departureAddressId,
      destinationAddressId: order.destinationAddressId,
      departureAddress: order.departureAddress,
      destinationAddress: order.destinationAddress,
      
      // Planification
      departureDate: order.departureDate,
      departureTime: order.departureTime,
      deliveryDate: order.deliveryDate,
      deliveryTime: order.deliveryTime,
      
      // Marchandise
      goodsType: order.goodsType,
      goodsDescription: order.goodsDescription,
      weight: order.weight,
      volume: order.volume,
      quantity: order.quantity,
      packagingType: order.packagingType,
      specialRequirements: order.specialRequirements,
      declaredValue: order.declaredValue,
      
      // Calculs
      estimatedDistance: order.estimatedDistance,
      estimatedDuration: order.estimatedDuration,
      basePrice: order.basePrice,
      totalPrice: order.totalPrice,
      
      // Contacts
      departureContact: order.departureContact,
      destinationContact: order.destinationContact,
      
      // Autres
      priority: order.priority,
      notes: order.notes,
      
      // Métadonnées
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      assignedAt: order.assignedAt,
      completedAt: order.completedAt
    };
  }
}

// Export de l'instance
export const transportOrderService = new TransportOrderService();