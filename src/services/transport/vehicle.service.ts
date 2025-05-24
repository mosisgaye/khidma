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

  // ============ STATISTIQUES ============

  /**
   * Obtenir les statistiques des véhicules d'un transporteur
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

    return {
      total: totalVehicles,
      byStatus: stats.reduce((acc, stat) => {
        acc[stat.status] = stat._count.id;
        return acc;
      }, {} as Record<string, number>),
      maintenanceDue,
      utilizationRate: totalVehicles > 0 
        ? ((stats.find(s => s.status === VehicleStatus.EN_COURS)?._count.id || 0) / totalVehicles) * 100
        : 0
    };
  }
}

// Export de l'instance
export const vehicleService = new VehicleService();