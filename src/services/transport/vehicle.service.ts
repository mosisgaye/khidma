import { VehicleType, VehicleStatus } from '@prisma/client';
import { 
  VehicleData, 
  VehicleResponse, 
  VehicleFilters,
  PaginatedResponse,
  VEHICLE_CAPACITIES
} from '@/types/transport.types';
import { 
  NotFoundError, 
  ValidationError, 
  ConflictError,
  AuthorizationError 
} from '@/middleware/errorHandler';
import prisma from '@/config/database';

// ============ SERVICE GESTION VÉHICULES ============

export class VehicleService {

  // ============ OPÉRATIONS CRUD ============

  /**
   * Créer un nouveau véhicule
   */
  async createVehicle(transporteurId: string, data: VehicleData): Promise<VehicleResponse> {
    // Vérifier que le transporteur existe
    const transporteur = await prisma.transporteur.findUnique({
      where: { id: transporteurId }
    });

    if (!transporteur) {
      throw new NotFoundError('Transporteur');
    }

    // Vérifier l'unicité de la plaque d'immatriculation
    const existingVehicle = await prisma.vehicle.findUnique({
      where: { plateNumber: data.plateNumber }
    });

    if (existingVehicle) {
      throw new ConflictError('Un véhicule avec cette plaque d\'immatriculation existe déjà');
    }

    // Vérifier l'unicité du numéro de châssis si fourni
    if (data.chassisNumber) {
      const existingChassis = await prisma.vehicle.findUnique({
        where: { chassisNumber: data.chassisNumber }
      });

      if (existingChassis) {
        throw new ConflictError('Un véhicule avec ce numéro de châssis existe déjà');
      }
    }

    // Valider la capacité selon le type de véhicule
    this.validateVehicleCapacity(data.type, data.capacity, data.volume);

    // Créer le véhicule
    const vehicle = await prisma.vehicle.create({
      data: {
        transporteurId,
        type: data.type,
        brand: data.brand,
        model: data.model,
        year: data.year,
        plateNumber: data.plateNumber,
        chassisNumber: data.chassisNumber,
        capacity: data.capacity,
        volume: data.volume,
        fuelType: data.fuelType,
        features: data.features,
        insurance: data.insurance,
        insuranceExpiry: data.insuranceExpiry,
        dailyRate: data.dailyRate,
        kmRate: data.kmRate,
        status: VehicleStatus.DISPONIBLE,
        images: [],
        isActive: true
      }
    });

    // Mettre à jour la taille de flotte du transporteur
    await this.updateFleetSize(transporteurId);

    return this.formatVehicleResponse(vehicle);
  }

  /**
   * Récupérer la liste des véhicules d'un transporteur
   */
  async getVehiclesByTransporteur(
    transporteurId: string, 
    filters: VehicleFilters
  ): Promise<PaginatedResponse<VehicleResponse>> {
    const { page = 1, limit = 10, ...searchFilters } = filters;
    const skip = (page - 1) * limit;

    // Construire les conditions de recherche
    const whereCondition: any = {
      transporteurId,
      isActive: true
    };

    if (searchFilters.type) {
      whereCondition.type = searchFilters.type;
    }

    if (searchFilters.status) {
      whereCondition.status = searchFilters.status;
    }

    if (searchFilters.minCapacity || searchFilters.maxCapacity) {
      whereCondition.capacity = {};
      if (searchFilters.minCapacity) {
        whereCondition.capacity.gte = searchFilters.minCapacity;
      }
      if (searchFilters.maxCapacity) {
        whereCondition.capacity.lte = searchFilters.maxCapacity;
      }
    }

    if (searchFilters.available !== undefined) {
      if (searchFilters.available) {
        whereCondition.status = VehicleStatus.DISPONIBLE;
      }
    }

    // Récupérer les véhicules avec pagination
    const [vehicles, total] = await Promise.all([
      prisma.vehicle.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: [
          { status: 'asc' }, // Disponibles en premier
          { createdAt: 'desc' }
        ],
        include: {
          maintenanceRecords: {
            take: 1,
            orderBy: { performedAt: 'desc' }
          }
        }
      }),
      prisma.vehicle.count({ where: whereCondition })
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: vehicles.map(v => this.formatVehicleResponse(v)),
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
   * Récupérer un véhicule par ID
   */
  async getVehicleById(id: string, transporteurId?: string): Promise<VehicleResponse> {
    const whereCondition: any = { id, isActive: true };
    
    if (transporteurId) {
      whereCondition.transporteurId = transporteurId;
    }

    const vehicle = await prisma.vehicle.findFirst({
      where: whereCondition,
      include: {
        transporteur: {
          select: {
            id: true,
            companyName: true,
            rating: true,
            verified: true
          }
        },
        maintenanceRecords: {
          orderBy: { performedAt: 'desc' },
          take: 5
        }
      }
    });

    if (!vehicle) {
      throw new NotFoundError('Véhicule');
    }

    return this.formatVehicleResponse(vehicle);
  }

  /**
   * Mettre à jour un véhicule
   */
  async updateVehicle(
    id: string, 
    transporteurId: string, 
    data: Partial<VehicleData>
  ): Promise<VehicleResponse> {
    // Vérifier que le véhicule appartient au transporteur
    const existingVehicle = await prisma.vehicle.findFirst({
      where: { id, transporteurId, isActive: true }
    });

    if (!existingVehicle) {
      throw new NotFoundError('Véhicule');
    }

    // Vérifier l'unicité de la plaque si modifiée
    if (data.plateNumber && data.plateNumber !== existingVehicle.plateNumber) {
      const plateExists = await prisma.vehicle.findFirst({
        where: { 
          plateNumber: data.plateNumber,
          id: { not: id }
        }
      });

      if (plateExists) {
        throw new ConflictError('Cette plaque d\'immatriculation est déjà utilisée');
      }
    }

    // Vérifier l'unicité du châssis si modifié
    if (data.chassisNumber && data.chassisNumber !== existingVehicle.chassisNumber) {
      const chassisExists = await prisma.vehicle.findFirst({
        where: { 
          chassisNumber: data.chassisNumber,
          id: { not: id }
        }
      });

      if (chassisExists) {
        throw new ConflictError('Ce numéro de châssis est déjà utilisé');
      }
    }

    // Valider la capacité si modifiée
    if (data.capacity || data.type) {
      const newType = data.type || existingVehicle.type;
      const newCapacity = data.capacity || existingVehicle.capacity;
      const newVolume = data.volume !== undefined ? data.volume : existingVehicle.volume;
      
      this.validateVehicleCapacity(newType, newCapacity, newVolume);
    }

    // Mettre à jour le véhicule
    const vehicle = await prisma.vehicle.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date()
      }
    });

    return this.formatVehicleResponse(vehicle);
  }

  /**
   * Changer le statut d'un véhicule
   */
  async updateVehicleStatus(
    id: string, 
    transporteurId: string, 
    status: VehicleStatus
  ): Promise<VehicleResponse> {
    // Vérifier que le véhicule appartient au transporteur
    const vehicle = await prisma.vehicle.findFirst({
      where: { id, transporteurId, isActive: true }
    });

    if (!vehicle) {
      throw new NotFoundError('Véhicule');
    }

    // Vérifier les transitions de statut autorisées
    this.validateStatusTransition(vehicle.status, status);

    // Mettre à jour le statut
    const updatedVehicle = await prisma.vehicle.update({
      where: { id },
      data: { 
        status,
        updatedAt: new Date()
      }
    });

    return this.formatVehicleResponse(updatedVehicle);
  }

  /**
   * Supprimer un véhicule (soft delete)
   */
  async deleteVehicle(id: string, transporteurId: string): Promise<void> {
    // Vérifier que le véhicule appartient au transporteur
    const vehicle = await prisma.vehicle.findFirst({
      where: { id, transporteurId, isActive: true }
    });

    if (!vehicle) {
      throw new NotFoundError('Véhicule');
    }

    // Vérifier qu'aucune commande active n'utilise ce véhicule
    const activeOrders = await prisma.transportOrder.count({
      where: {
        vehicleId: id,
        status: {
          in: ['CONFIRME', 'EN_PREPARATION', 'EN_TRANSIT']
        }
      }
    });

    if (activeOrders > 0) {
      throw new ValidationError([{
        field: 'vehicle',
        message: 'Impossible de supprimer un véhicule avec des commandes actives'
      }]);
    }

    // Soft delete
    await prisma.vehicle.update({
      where: { id },
      data: { 
        isActive: false,
        updatedAt: new Date()
      }
    });

    // Mettre à jour la taille de flotte
    await this.updateFleetSize(transporteurId);
  }

  // ============ MAINTENANCE ============

  /**
   * Ajouter un enregistrement de maintenance
   */
  async addMaintenanceRecord(
    vehicleId: string,
    transporteurId: string,
    maintenanceData: {
      type: 'PREVENTIVE' | 'CORRECTIVE' | 'ACCIDENT';
      description: string;
      cost?: number;
      mileage?: number;
      performedBy?: string;
      performedAt: Date;
      nextDue?: Date;
      nextMileage?: number;
      documents?: string[];
    }
  ): Promise<any> {
    // Vérifier que le véhicule appartient au transporteur
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, transporteurId, isActive: true }
    });

    if (!vehicle) {
      throw new NotFoundError('Véhicule');
    }

    // Créer l'enregistrement de maintenance
    const maintenanceRecord = await prisma.maintenanceRecord.create({
      data: {
        vehicleId,
        type: maintenanceData.type,
        description: maintenanceData.description,
        cost: maintenanceData.cost,
        mileage: maintenanceData.mileage,
        performedBy: maintenanceData.performedBy,
        performedAt: maintenanceData.performedAt,
        nextDue: maintenanceData.nextDue,
        nextMileage: maintenanceData.nextMileage,
        documents: maintenanceData.documents || []
      }
    });

    // Mettre à jour les données de maintenance du véhicule
    await prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        lastMaintenance: maintenanceData.performedAt,
        nextMaintenance: maintenanceData.nextDue,
        mileage: maintenanceData.mileage || vehicle.mileage,
        updatedAt: new Date()
      }
    });

    return maintenanceRecord;
  }

  // ============ RECHERCHE PUBLIQUE ============

  /**
   * Rechercher des véhicules disponibles (pour expéditeurs)
   */
  async searchAvailableVehicles(filters: {
    region?: string;
    city?: string;
    vehicleType?: VehicleType;
    minCapacity?: number;
    maxCapacity?: number;
    departureDate?: Date;
    goodsType?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<any>> {
    const { page = 1, limit = 10, ...searchFilters } = filters;
    const skip = (page - 1) * limit;

    // Construire les conditions de recherche
    const whereCondition: any = {
      status: VehicleStatus.DISPONIBLE,
      isActive: true,
      transporteur: {
        verified: true,
        user: {
          status: 'ACTIVE'
        }
      }
    };

    if (searchFilters.vehicleType) {
      whereCondition.type = searchFilters.vehicleType;
    }

    if (searchFilters.minCapacity || searchFilters.maxCapacity) {
      whereCondition.capacity = {};
      if (searchFilters.minCapacity) {
        whereCondition.capacity.gte = searchFilters.minCapacity;
      }
      if (searchFilters.maxCapacity) {
        whereCondition.capacity.lte = searchFilters.maxCapacity;
      }
    }

    // Récupérer les véhicules avec informations transporteur
    const [vehicles, total] = await Promise.all([
      prisma.vehicle.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: [
          { transporteur: { rating: 'desc' } },
          { transporteur: { verified: 'desc' } },
          { capacity: 'asc' }
        ],
        include: {
          transporteur: {
            select: {
              id: true,
              companyName: true,
              rating: true,
              totalRides: true,
              completionRate: true,
              verified: true,
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                  phone: true
                }
              }
            }
          }
        }
      }),
      prisma.vehicle.count({ where: whereCondition })
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: vehicles.map(v => ({
        id: v.id,
        type: v.type,
        brand: v.brand,
        model: v.model,
        capacity: v.capacity,
        volume: v.volume,
        features: v.features,
        dailyRate: v.dailyRate,
        kmRate: v.kmRate,
        transporteur: v.transporteur
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

  // ============ MÉTHODES PRIVÉES ============

  /**
   * Valider la capacité d'un véhicule selon son type
   */
  private validateVehicleCapacity(type: VehicleType, capacity: number, volume?: number | null): void {
    const limits = VEHICLE_CAPACITIES[type];
    
    if (capacity > limits.weight) {
      throw new ValidationError([{
        field: 'capacity',
        message: `Capacité maximale pour ${type}: ${limits.weight}kg`
      }]);
    }

    if (volume && volume > limits.volume) {
      throw new ValidationError([{
        field: 'volume',
        message: `Volume maximal pour ${type}: ${limits.volume}m³`
      }]);
    }
  }

  /**
   * Valider les transitions de statut
   */
  private validateStatusTransition(currentStatus: VehicleStatus, newStatus: VehicleStatus): void {
    const allowedTransitions: Record<VehicleStatus, VehicleStatus[]> = {
      [VehicleStatus.DISPONIBLE]: [VehicleStatus.EN_COURS, VehicleStatus.MAINTENANCE, VehicleStatus.RESERVE],
      [VehicleStatus.EN_COURS]: [VehicleStatus.DISPONIBLE],
      [VehicleStatus.MAINTENANCE]: [VehicleStatus.DISPONIBLE, VehicleStatus.HORS_SERVICE],
      [VehicleStatus.HORS_SERVICE]: [VehicleStatus.MAINTENANCE, VehicleStatus.DISPONIBLE],
      [VehicleStatus.RESERVE]: [VehicleStatus.DISPONIBLE, VehicleStatus.EN_COURS]
    };

    if (!allowedTransitions[currentStatus].includes(newStatus)) {
      throw new ValidationError([{
        field: 'status',
        message: `Transition de ${currentStatus} vers ${newStatus} non autorisée`
      }]);
    }
  }

  /**
   * Mettre à jour la taille de flotte du transporteur
   */
  private async updateFleetSize(transporteurId: string): Promise<void> {
    const fleetSize = await prisma.vehicle.count({
      where: {
        transporteurId,
        isActive: true
      }
    });

    await prisma.transporteur.update({
      where: { id: transporteurId },
      data: { fleetSize }
    });
  }

  /**
   * Formater la réponse véhicule
   */
  private formatVehicleResponse(vehicle: any): VehicleResponse {
    return {
      id: vehicle.id,
      transporteurId: vehicle.transporteurId,
      type: vehicle.type,
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year,
      plateNumber: vehicle.plateNumber,
      chassisNumber: vehicle.chassisNumber,
      capacity: vehicle.capacity,
      volume: vehicle.volume,
      fuelType: vehicle.fuelType,
      status: vehicle.status,
      images: vehicle.images,
      features: vehicle.features,
      insurance: vehicle.insurance,
      insuranceExpiry: vehicle.insuranceExpiry,
      lastMaintenance: vehicle.lastMaintenance,
      nextMaintenance: vehicle.nextMaintenance,
      mileage: vehicle.mileage,
      dailyRate: vehicle.dailyRate,
      kmRate: vehicle.kmRate,
      isActive: vehicle.isActive,
      createdAt: vehicle.createdAt,
      updatedAt: vehicle.updatedAt
    };
  }

  // ============ GESTION AVANCÉE DES VÉHICULES ============

  /**
   * Uploader des images pour un véhicule
   */
  async uploadVehicleImages(
    vehicleId: string,
    transporteurId: string,
    imageUrls: string[]
  ): Promise<VehicleResponse> {
    // Vérifier que le véhicule appartient au transporteur
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, transporteurId, isActive: true }
    });

    if (!vehicle) {
      throw new NotFoundError('Véhicule');
    }

    // Limiter le nombre d'images (max 10)
    const currentImages = vehicle.images || [];
    const totalImages = currentImages.length + imageUrls.length;
    
    if (totalImages > 10) {
      throw new ValidationError([{
        field: 'images',
        message: 'Maximum 10 images par véhicule'
      }]);
    }

    // Ajouter les nouvelles images
    const updatedVehicle = await prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        images: [...currentImages, ...imageUrls],
        updatedAt: new Date()
      }
    });

    return this.formatVehicleResponse(updatedVehicle);
  }

  /**
   * Supprimer une image d'un véhicule
   */
  async removeVehicleImage(
    vehicleId: string,
    transporteurId: string,
    imageUrl: string
  ): Promise<VehicleResponse> {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, transporteurId, isActive: true }
    });

    if (!vehicle) {
      throw new NotFoundError('Véhicule');
    }

    // Retirer l'image de la liste
    const updatedImages = (vehicle.images || []).filter(img => img !== imageUrl);

    const updatedVehicle = await prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        images: updatedImages,
        updatedAt: new Date()
      }
    });

    return this.formatVehicleResponse(updatedVehicle);
  }

  /**
   * Mettre à jour le kilométrage d'un véhicule
   */
  async updateMileage(
    vehicleId: string,
    transporteurId: string,
    newMileage: number,
    notes?: string
  ): Promise<VehicleResponse> {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, transporteurId, isActive: true }
    });

    if (!vehicle) {
      throw new NotFoundError('Véhicule');
    }

    // Vérifier que le nouveau kilométrage est cohérent
    if (vehicle.mileage && newMileage < vehicle.mileage) {
      throw new ValidationError([{
        field: 'mileage',
        message: 'Le nouveau kilométrage ne peut pas être inférieur à l\'actuel'
      }]);
    }

    const updatedVehicle = await prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        mileage: newMileage,
        updatedAt: new Date()
      }
    });

    // Enregistrer l'historique du kilométrage si significatif
    if (vehicle.mileage && (newMileage - vehicle.mileage) > 100) {
      await prisma.maintenanceRecord.create({
        data: {
          vehicleId,
          type: 'PREVENTIVE',
          description: `Mise à jour kilométrage: ${vehicle.mileage} → ${newMileage}km${notes ? ` - ${notes}` : ''}`,
          mileage: newMileage,
          performedAt: new Date()
        }
      });
    }

    return this.formatVehicleResponse(updatedVehicle);
  }

  /**
   * Planifier une maintenance
   */
  async scheduleMaintenance(
    vehicleId: string,
    transporteurId: string,
    maintenanceData: {
      type: 'PREVENTIVE' | 'CORRECTIVE';
      description: string;
      scheduledDate: Date;
      estimatedCost?: number;
      garage?: string;
      notes?: string;
    }
  ): Promise<any> {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, transporteurId, isActive: true }
    });

    if (!vehicle) {
      throw new NotFoundError('Véhicule');
    }

    // Vérifier que la date est future
    if (maintenanceData.scheduledDate <= new Date()) {
      throw new ValidationError([{
        field: 'scheduledDate',
        message: 'La date de maintenance doit être future'
      }]);
    }

    // Créer l'enregistrement de maintenance planifiée
    const scheduledMaintenance = await prisma.maintenanceRecord.create({
      data: {
        vehicleId,
        type: maintenanceData.type,
        description: `PLANIFIÉ: ${maintenanceData.description}`,
        performedBy: maintenanceData.garage,
        performedAt: maintenanceData.scheduledDate,
        cost: maintenanceData.estimatedCost,
        documents: []
      }
    });

    // Mettre à jour la date de prochaine maintenance du véhicule
    await prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        nextMaintenance: maintenanceData.scheduledDate,
        updatedAt: new Date()
      }
    });

    return scheduledMaintenance;
  }

  /**
   * Obtenir l'historique complet d'un véhicule
   */
  async getVehicleHistory(
    vehicleId: string,
    transporteurId: string
  ): Promise<{
    vehicle: VehicleResponse;
    maintenanceHistory: any[];
    orderHistory: any[];
    documentHistory: any[];
    timeline: any[];
  }> {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, transporteurId, isActive: true }
    });

    if (!vehicle) {
      throw new NotFoundError('Véhicule');
    }

    // Récupérer l'historique de maintenance
    const maintenanceHistory = await prisma.maintenanceRecord.findMany({
      where: { vehicleId },
      orderBy: { performedAt: 'desc' }
    });

    // Récupérer l'historique des commandes
    const orderHistory = await prisma.transportOrder.findMany({
      where: { vehicleId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        departureDate: true,
        completedAt: true,
        totalPrice: true,
        estimatedDistance: true,
        actualDistance: true,
        departureAddress: {
          select: { city: true }
        },
        destinationAddress: {
          select: { city: true }
        }
      },
      orderBy: { departureDate: 'desc' }
    });

    // Créer une timeline combinée
    const timeline = [
      ...maintenanceHistory.map(m => ({
        type: 'maintenance',
        date: m.performedAt,
        description: m.description,
        cost: m.cost,
        details: m
      })),
      ...orderHistory.map(o => ({
        type: 'order',
        date: o.departureDate,
        description: `Transport ${o.departureAddress.city} → ${o.destinationAddress.city}`,
        revenue: o.totalPrice,
        details: o
      }))
    ].sort((a, b) => b.date.getTime() - a.date.getTime());

    return {
      vehicle: this.formatVehicleResponse(vehicle),
      maintenanceHistory,
      orderHistory,
      documentHistory: [], // TODO: Ajouter gestion des documents
      timeline
    };
  }

  /**
   * Calculer la rentabilité d'un véhicule
   */
  async calculateVehicleProfitability(
    vehicleId: string,
    transporteurId: string,
    period: { startDate: Date; endDate: Date }
  ): Promise<{
    revenue: number;
    maintenanceCosts: number;
    operatingDays: number;
    totalOrders: number;
    averageRevenuePerOrder: number;
    profitMargin: number;
    recommendations: string[];
  }> {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, transporteurId, isActive: true }
    });

    if (!vehicle) {
      throw new NotFoundError('Véhicule');
    }

    // Calculer les revenus
    const orderStats = await prisma.transportOrder.aggregate({
      where: {
        vehicleId,
        completedAt: {
          gte: period.startDate,
          lte: period.endDate
        },
        status: 'LIVRE'
      },
      _sum: { totalPrice: true },
      _count: { id: true }
    });

    // Calculer les coûts de maintenance
    const maintenanceCosts = await prisma.maintenanceRecord.aggregate({
      where: {
        vehicleId,
        performedAt: {
          gte: period.startDate,
          lte: period.endDate
        }
      },
      _sum: { cost: true }
    });

    const revenue = orderStats._sum.totalPrice || 0;
    const costs = maintenanceCosts._sum.cost || 0;
    const totalOrders = orderStats._count;
    const operatingDays = Math.ceil((period.endDate.getTime() - period.startDate.getTime()) / (24 * 60 * 60 * 1000));
    
    const averageRevenuePerOrder = totalOrders > 0 ? revenue / totalOrders : 0;
    const profitMargin = revenue > 0 ? ((revenue - costs) / revenue) * 100 : 0;

    // Générer des recommandations
    const recommendations: string[] = [];
    
    if (profitMargin < 20) {
      recommendations.push('Marge bénéficiaire faible - réviser les tarifs');
    }
    
    if (totalOrders / operatingDays < 0.5) {
      recommendations.push('Faible taux d\'utilisation - améliorer la disponibilité');
    }
    
    if (costs / revenue > 0.3) {
      recommendations.push('Coûts de maintenance élevés - réviser la stratégie de maintenance');
    }

    return {
      revenue,
      maintenanceCosts: costs,
      operatingDays,
      totalOrders,
      averageRevenuePerOrder,
      profitMargin,
      recommendations
    };
  }

  /**
   * Prédire les besoins de maintenance
   */
  async predictMaintenanceNeeds(
    vehicleId: string,
    transporteurId: string
  ): Promise<{
    urgentMaintenance: any[];
    upcomingMaintenance: any[];
    recommendations: string[];
    healthScore: number;
  }> {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, transporteurId, isActive: true },
      include: {
        maintenanceRecords: {
          orderBy: { performedAt: 'desc' },
          take: 10
        }
      }
    });

    if (!vehicle) {
      throw new NotFoundError('Véhicule');
    }

    const now = new Date();
    const urgentMaintenance = [];
    const upcomingMaintenance = [];
    const recommendations = [];
    
    // Vérifier la maintenance programmée
    if (vehicle.nextMaintenance) {
      const daysUntilMaintenance = Math.ceil((vehicle.nextMaintenance.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      
      if (daysUntilMaintenance <= 7) {
        urgentMaintenance.push({
          type: 'scheduled',
          description: 'Maintenance programmée',
          dueDate: vehicle.nextMaintenance,
          priority: 'HIGH'
        });
      } else if (daysUntilMaintenance <= 30) {
        upcomingMaintenance.push({
          type: 'scheduled',
          description: 'Maintenance programmée',
          dueDate: vehicle.nextMaintenance,
          priority: 'MEDIUM'
        });
      }
    }

    // Analyser l'âge du véhicule
    const vehicleAge = now.getFullYear() - vehicle.year;
    if (vehicleAge > 10) {
      recommendations.push('Véhicule ancien - maintenance préventive renforcée recommandée');
    }

    // Analyser le kilométrage
    if (vehicle.mileage) {
      if (vehicle.mileage > 300000) {
        recommendations.push('Kilométrage élevé - surveillance accrue nécessaire');
      }
      
      // Vérifications basées sur le kilométrage
      const lastMaintenance = vehicle.maintenanceRecords[0];
      if (lastMaintenance && lastMaintenance.mileage) {
        const kmSinceMaintenance = vehicle.mileage - lastMaintenance.mileage;
        
        if (kmSinceMaintenance > 15000) {
          urgentMaintenance.push({
            type: 'mileage',
            description: 'Maintenance basée sur le kilométrage',
            dueDate: now,
            priority: 'HIGH'
          });
        }
      }
    }

    // Calculer un score de santé (0-100)
    let healthScore = 100;
    
    // Pénalités basées sur l'âge
    healthScore -= Math.min(vehicleAge * 2, 20);
    
    // Pénalités basées sur les maintenances récentes
    const recentMaintenances = vehicle.maintenanceRecords.filter(
      m => m.performedAt > new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    );
    
    if (recentMaintenances.length > 3) {
      healthScore -= 15; // Maintenances fréquentes
    }
    
    // Pénalités pour maintenance en retard
    if (vehicle.nextMaintenance && vehicle.nextMaintenance < now) {
      healthScore -= 25;
    }

    healthScore = Math.max(0, Math.min(100, healthScore));

    return {
      urgentMaintenance,
      upcomingMaintenance,
      recommendations,
      healthScore
    };
  }

  /**
   * Optimiser l'utilisation de la flotte
   */
  async optimizeFleetUtilization(
    transporteurId: string
  ): Promise<{
    recommendations: Array<{
      vehicleId: string;
      vehicle: any;
      issue: string;
      recommendation: string;
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
      potentialSavings?: number;
    }>;
    fleetOverview: {
      totalVehicles: number;
      utilizationRate: number;
      maintenanceCosts: number;
      revenue: number;
      efficiency: string;
    };
  }> {
    // Récupérer tous les véhicules avec leurs statistiques
    const vehicles = await prisma.vehicle.findMany({
      where: {
        transporteurId,
        isActive: true
      },
      include: {
        maintenanceRecords: {
          where: {
            performedAt: {
              gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // 90 derniers jours
            }
          }
        },
        transportOrders: {
          where: {
            completedAt: {
              gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
            },
            status: 'LIVRE'
          }
        }
      }
    });

    const recommendations = [];
    
    for (const vehicle of vehicles) {
      // Analyser l'utilisation
      const ordersLast90Days = vehicle.transportOrders.length;
      const utilizationRate = ordersLast90Days / 90; // ordres par jour
      
      if (utilizationRate < 0.1) {
        recommendations.push({
          vehicleId: vehicle.id,
          vehicle: {
            plateNumber: vehicle.plateNumber,
            type: vehicle.type,
            status: vehicle.status
          },
          issue: 'Faible utilisation',
          recommendation: 'Réviser les tarifs ou considérer la mise en vente',
          priority: 'MEDIUM' as const,
          potentialSavings: 50000 // Estimation
        });
      }
      
      // Analyser les coûts de maintenance
      const maintenanceCosts = vehicle.maintenanceRecords.reduce(
        (sum, record) => sum + (record.cost || 0), 0
      );
      
      const revenue = vehicle.transportOrders.reduce(
        (sum, order) => sum + (order.totalPrice || 0), 0
      );
      
      if (maintenanceCosts > revenue * 0.4) {
        recommendations.push({
          vehicleId: vehicle.id,
          vehicle: {
            plateNumber: vehicle.plateNumber,
            type: vehicle.type,
            status: vehicle.status
          },
          issue: 'Coûts de maintenance élevés',
          recommendation: 'Évaluer le remplacement du véhicule',
          priority: 'HIGH' as const,
          potentialSavings: maintenanceCosts * 0.5
        });
      }
    }

    // Calculer les métriques globales
    const totalOrders = vehicles.reduce((sum, v) => sum + v.transportOrders.length, 0);
    const totalRevenue = vehicles.reduce((sum, v) => 
      sum + v.transportOrders.reduce((orderSum, o) => orderSum + (o.totalPrice || 0), 0), 0
    );
    const totalMaintenanceCosts = vehicles.reduce((sum, v) => 
      sum + v.maintenanceRecords.reduce((maintSum, m) => maintSum + (m.cost || 0), 0), 0
    );
    
    const utilizationRate = vehicles.length > 0 ? (totalOrders / vehicles.length / 90) * 100 : 0;
    const efficiency = utilizationRate > 50 ? 'EXCELLENT' : utilizationRate > 30 ? 'BON' : utilizationRate > 15 ? 'MOYEN' : 'FAIBLE';

    return {
      recommendations,
      fleetOverview: {
        totalVehicles: vehicles.length,
        utilizationRate,
        maintenanceCosts: totalMaintenanceCosts,
        revenue: totalRevenue,
        efficiency
      }
    };
  }

  // ============ STATISTIQUES AVANCÉES ============

  /**
   * Obtenir les statistiques détaillées des véhicules d'un transporteur
   */
  async getVehicleStats(transporteurId: string): Promise<any> {
    const stats = await prisma.vehicle.groupBy({
      by: ['status'],
      where: {
        transporteurId,
        isActive: true
      },
      _count: {
        id: true
      }
    });

    const totalVehicles = await prisma.vehicle.count({
      where: {
        transporteurId,
        isActive: true
      }
    });

    const maintenanceDue = await prisma.vehicle.count({
      where: {
        transporteurId,
        isActive: true,
        nextMaintenance: {
          lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 jours
        }
      }
    });

    // Statistiques avancées
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const revenueStats = await prisma.transportOrder.aggregate({
      where: {
        transporteurId,
        completedAt: { gte: last30Days },
        status: 'LIVRE'
      },
      _sum: { totalPrice: true },
      _count: { id: true }
    });

    const maintenanceStats = await prisma.maintenanceRecord.aggregate({
      where: {
        vehicle: { transporteurId },
        performedAt: { gte: last30Days }
      },
      _sum: { cost: true },
      _count: { id: true }
    });

    const utilizationRate = totalVehicles > 0 
      ? ((stats.find(s => s.status === VehicleStatus.EN_COURS)?._count.id || 0) / totalVehicles) * 100
      : 0;

    return {
      total: totalVehicles,
      byStatus: stats.reduce((acc, stat) => {
        acc[stat.status] = stat._count.id;
        return acc;
      }, {} as Record<string, number>),
      maintenanceDue,
      utilizationRate,
      performance: {
        totalRevenue: revenueStats._sum.totalPrice || 0,
        totalOrders: revenueStats._count,
        averageRevenuePerOrder: revenueStats._count > 0 
          ? (revenueStats._sum.totalPrice || 0) / revenueStats._count 
          : 0,
        maintenanceCosts: maintenanceStats._sum.cost || 0,
        profitMargin: revenueStats._sum.totalPrice 
          ? ((revenueStats._sum.totalPrice - (maintenanceStats._sum.cost || 0)) / revenueStats._sum.totalPrice) * 100
          : 0
      }
    };
  }
}

// Export de l'instance
export const vehicleService = new VehicleService();