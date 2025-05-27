import { AvailabilityType, VehicleStatus } from '@prisma/client';
import { 
  AvailabilityData,
  AvailabilityResponse,
  PaginatedResponse
} from '@/types/transport.types';
import { 
  NotFoundError, 
  ValidationError, 
  AuthorizationError,
  ConflictError
} from '@/middleware/errorHandler';
import prisma from '@/config/database';

// ============ SERVICE GESTION DES DISPONIBILITÉS ============

export class AvailabilityService {

  // ============ GESTION DES DISPONIBILITÉS ============

  /**
   * Créer une période de disponibilité
   */
  async createAvailability(
    userId: string,
    userRole: string,
    data: AvailabilityData
  ): Promise<AvailabilityResponse> {
    // Valider les données
    this.validateAvailabilityData(data);

    // Obtenir l'ID du transporteur
    const transporteurId = await this.getTransporteurId(userId, userRole);

    // Vérifier que le véhicule appartient au transporteur (si spécifié)
    if (data.vehicleId) {
      await this.validateVehicleOwnership(data.vehicleId, transporteurId);
    }

    // Vérifier les conflits de disponibilité
    await this.checkAvailabilityConflicts(transporteurId, data);

    // Créer la disponibilité
    const availability = await prisma.availability.create({
      data: {
        transporteurId: data.transporteurId || transporteurId,
        vehicleId: data.vehicleId,
        type: data.type,
        startDate: data.startDate,
        endDate: data.endDate,
        startTime: data.startTime,
        endTime: data.endTime,
        isRecurring: data.isRecurring,
        recurrencePattern: data.recurrencePattern,
        notes: data.notes
      }
    });

    // Mettre à jour le statut du véhicule si nécessaire
    if (data.vehicleId) {
      await this.updateVehicleStatusFromAvailability(data.vehicleId, data.type);
    }

    // Générer les occurrences récurrentes si applicable
    if (data.isRecurring && data.recurrencePattern) {
      await this.generateRecurringAvailabilities(availability.id, data);
    }

    return this.formatAvailabilityResponse(availability);
  }

  /**
   * Mettre à jour une disponibilité
   */
  async updateAvailability(
    availabilityId: string,
    userId: string,
    userRole: string,
    data: Partial<AvailabilityData>
  ): Promise<AvailabilityResponse> {
    // Vérifier que la disponibilité existe et appartient à l'utilisateur
    const availability = await this.validateAvailabilityAccess(availabilityId, userId, userRole);

    // Valider les nouvelles données
    if (data.startDate || data.endDate) {
      this.validateAvailabilityData({
        ...availability,
        ...data
      } as AvailabilityData);
    }

    // Vérifier les conflits si les dates changent
    if (data.startDate || data.endDate || data.type) {
      await this.checkAvailabilityConflicts(
        availability.transporteurId!,
        { ...availability, ...data } as AvailabilityData,
        availabilityId
      );
    }

    // Mettre à jour la disponibilité
    const updatedAvailability = await prisma.availability.update({
      where: { id: availabilityId },
      data: {
        ...(data.type !== undefined && { type: data.type }),
        ...(data.startDate !== undefined && { startDate: data.startDate }),
        ...(data.endDate !== undefined && { endDate: data.endDate }),
        ...(data.startTime !== undefined && { startTime: data.startTime }),
        ...(data.endTime !== undefined && { endTime: data.endTime }),
        ...(data.isRecurring !== undefined && { isRecurring: data.isRecurring }),
        ...(data.recurrencePattern !== undefined && { recurrencePattern: data.recurrencePattern }),
        ...(data.notes !== undefined && { notes: data.notes }),
        updatedAt: new Date()
      }
    });

    // Mettre à jour le statut du véhicule si nécessaire
    if (availability.vehicleId && data.type) {
      await this.updateVehicleStatusFromAvailability(availability.vehicleId, data.type);
    }

    return this.formatAvailabilityResponse(updatedAvailability);
  }

  /**
   * Supprimer une disponibilité
   */
  async deleteAvailability(
    availabilityId: string,
    userId: string,
    userRole: string
  ): Promise<void> {
    // Vérifier l'accès
    const availability = await this.validateAvailabilityAccess(availabilityId, userId, userRole);

    // Supprimer la disponibilité
    await prisma.availability.delete({
      where: { id: availabilityId }
    });

    // Remettre le véhicule en disponible si c'était une indisponibilité
    if (availability.vehicleId && availability.type !== AvailabilityType.DISPONIBLE) {
      await this.updateVehicleStatusFromAvailability(
        availability.vehicleId,
        AvailabilityType.DISPONIBLE
      );
    }
  }

  // ============ CONSULTATION DES DISPONIBILITÉS ============

  /**
   * Récupérer les disponibilités d'un transporteur
   */
  async getTransporteurAvailabilities(
    userId: string,
    userRole: string,
    filters: {
      vehicleId?: string;
      type?: AvailabilityType;
      startDate?: Date;
      endDate?: Date;
      includeExpired?: boolean;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<PaginatedResponse<AvailabilityResponse & { vehicle?: any }>> {
    const transporteurId = await this.getTransporteurId(userId, userRole);
    
    const { 
      page = 1, 
      limit = 20, 
      includeExpired = false,
      ...otherFilters 
    } = filters;
    
    const skip = (page - 1) * limit;
    const now = new Date();

    // Construire les conditions de filtrage
    const whereCondition: any = {
      transporteurId,
      ...(otherFilters.vehicleId && { vehicleId: otherFilters.vehicleId }),
      ...(otherFilters.type && { type: otherFilters.type }),
      ...(otherFilters.startDate && { startDate: { gte: otherFilters.startDate } }),
      ...(otherFilters.endDate && { endDate: { lte: otherFilters.endDate } }),
      ...(!includeExpired && { endDate: { gte: now } })
    };

    // Récupérer les disponibilités
    const [availabilities, total] = await Promise.all([
      prisma.availability.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: { startDate: 'asc' },
        include: {
          vehicle: {
            select: {
              id: true,
              type: true,
              brand: true,
              model: true,
              plateNumber: true,
              status: true
            }
          }
        }
      }),
      prisma.availability.count({ where: whereCondition })
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: availabilities.map(availability => ({
        ...this.formatAvailabilityResponse(availability),
        vehicle: availability.vehicle
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

  /**
   * Vérifier la disponibilité pour une période donnée
   */
  async checkAvailabilityForPeriod(
    transporteurId: string,
    startDate: Date,
    endDate: Date,
    vehicleId?: string
  ): Promise<{
    isAvailable: boolean;
    conflicts: Array<{
      type: AvailabilityType;
      startDate: Date;
      endDate: Date;
      reason?: string;
    }>;
    availableVehicles: Array<{
      id: string;
      type: string;
      plateNumber: string;
      capacity: number;
    }>;
  }> {
    // Rechercher les conflits de disponibilité
    const conflicts = await prisma.availability.findMany({
      where: {
        transporteurId,
        ...(vehicleId && { vehicleId }),
        type: { not: AvailabilityType.DISPONIBLE },
        OR: [
          {
            startDate: { lte: endDate },
            endDate: { gte: startDate }
          }
        ]
      },
      select: {
        type: true,
        startDate: true,
        endDate: true,
        notes: true
      }
    });

    // Rechercher les véhicules disponibles (si pas de véhicule spécifique)
    let availableVehicles: any[] = [];
    if (!vehicleId) {
      availableVehicles = await this.findAvailableVehicles(transporteurId, startDate, endDate);
    }

    return {
      isAvailable: conflicts.length === 0,
      conflicts: conflicts.map(conflict => ({
        type: conflict.type,
        startDate: conflict.startDate,
        endDate: conflict.endDate,
        reason: conflict.notes || undefined
      })),
      availableVehicles
    };
  }

  /**
   * Obtenir le planning d'un transporteur
   */
  async getTransporteurSchedule(
    transporteurId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    date: string;
    availabilities: Array<{
      type: AvailabilityType;
      startTime?: string;
      endTime?: string;
      vehicleId?: string;
      vehicle?: any;
      notes?: string;
    }>;
    orders: Array<{
      id: string;
      orderNumber: string;
      status: string;
      route: string;
      departureTime?: string;
      vehicleId?: string;
    }>;
  }[]> {
    // Récupérer les disponibilités
    const availabilities = await prisma.availability.findMany({
      where: {
        transporteurId,
        startDate: { lte: endDate },
        endDate: { gte: startDate }
      },
      include: {
        vehicle: {
          select: {
            id: true,
            type: true,
            plateNumber: true
          }
        }
      },
      orderBy: { startDate: 'asc' }
    });

    // Récupérer les commandes
    const orders = await prisma.transportOrder.findMany({
      where: {
        transporteurId,
        departureDate: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        departureAddress: {
          select: { city: true }
        },
        destinationAddress: {
          select: { city: true }
        }
      },
      orderBy: { departureDate: 'asc' }
    });

    // Organiser par jour
    const schedule: Map<string, any> = new Map();
    
    // Ajouter les disponibilités
    availabilities.forEach(availability => {
      const dateKey = availability.startDate.toISOString().split('T')[0];
      
      if (!schedule.has(dateKey)) {
        schedule.set(dateKey, { date: dateKey, availabilities: [], orders: [] });
      }
      
      schedule.get(dateKey)!.availabilities.push({
        type: availability.type,
        startTime: availability.startTime,
        endTime: availability.endTime,
        vehicleId: availability.vehicleId,
        vehicle: availability.vehicle,
        notes: availability.notes
      });
    });

    // Ajouter les commandes
    orders.forEach(order => {
      const dateKey = order.departureDate.toISOString().split('T')[0];
      
      if (!schedule.has(dateKey)) {
        schedule.set(dateKey, { date: dateKey, availabilities: [], orders: [] });
      }
      
      schedule.get(dateKey)!.orders.push({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        route: `${order.departureAddress.city} → ${order.destinationAddress.city}`,
        departureTime: order.departureTime,
        vehicleId: order.vehicleId
      });
    });

    return Array.from(schedule.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  // ============ AUTOMATISATION ============

  /**
   * Marquer automatiquement les indisponibilités pour les commandes assignées
   */
  async autoMarkBusyForOrder(
    orderId: string,
    transporteurId: string,
    vehicleId: string
  ): Promise<void> {
    const order = await prisma.transportOrder.findUnique({
      where: { id: orderId },
      select: {
        departureDate: true,
        deliveryDate: true,
        estimatedDuration: true
      }
    });

    if (!order) return;

    // Calculer la date de fin (livraison ou estimation)
    let endDate = order.deliveryDate;
    if (!endDate && order.estimatedDuration) {
      endDate = new Date(order.departureDate.getTime() + order.estimatedDuration * 60 * 1000);
    }
    if (!endDate) {
      // Par défaut, ajouter 24h
      endDate = new Date(order.departureDate.getTime() + 24 * 60 * 60 * 1000);
    }

    // Créer l'indisponibilité automatique
    await prisma.availability.create({
      data: {
        transporteurId,
        vehicleId,
        type: AvailabilityType.OCCUPE,
        startDate: order.departureDate,
        endDate,
        notes: `Commande assignée automatiquement`,
        isRecurring: false
      }
    });
  }

  /**
   * Libérer automatiquement les disponibilités en fin de commande
   */
  async autoReleaseAfterOrder(
    orderId: string,
    transporteurId: string,
    vehicleId: string
  ): Promise<void> {
    // Supprimer les indisponibilités automatiques liées à cette commande
    await prisma.availability.deleteMany({
      where: {
        transporteurId,
        vehicleId,
        type: AvailabilityType.OCCUPE,
        notes: { contains: 'Commande assignée automatiquement' }
      }
    });
  }

  // ============ MÉTHODES PRIVÉES ============

  /**
   * Valider les données de disponibilité
   */
  private validateAvailabilityData(data: AvailabilityData): void {
    const errors: any[] = [];

    // Vérifier que la date de fin est après la date de début
    if (data.endDate <= data.startDate) {
      errors.push({
        field: 'endDate',
        message: 'La date de fin doit être après la date de début'
      });
    }

    // Vérifier les heures si fournies
    if (data.startTime && data.endTime) {
      const startTime = this.parseTime(data.startTime);
      const endTime = this.parseTime(data.endTime);
      
      if (endTime <= startTime) {
        errors.push({
          field: 'endTime',
          message: 'L\'heure de fin doit être après l\'heure de début'
        });
      }
    }

    // Vérifier la récurrence
    if (data.isRecurring && !data.recurrencePattern) {
      errors.push({
        field: 'recurrencePattern',
        message: 'Le motif de récurrence est requis pour les disponibilités récurrentes'
      });
    }

    if (errors.length > 0) {
      throw new ValidationError(errors);
    }
  }

  /**
   * Vérifier les conflits de disponibilité
   */
  private async checkAvailabilityConflicts(
    transporteurId: string,
    data: AvailabilityData,
    excludeId?: string
  ): Promise<void> {
    const whereCondition: any = {
      transporteurId,
      OR: [
        {
          startDate: { lte: data.endDate },
          endDate: { gte: data.startDate }
        }
      ]
    };

    if (data.vehicleId) {
      whereCondition.vehicleId = data.vehicleId;
    }

    if (excludeId) {
      whereCondition.id = { not: excludeId };
    }

    const conflicts = await prisma.availability.findMany({
      where: whereCondition,
      select: {
        id: true,
        type: true,
        startDate: true,
        endDate: true
      }
    });

    // Vérifier les conflits selon le type
    const significantConflicts = conflicts.filter(conflict => {
      // Les disponibilités ne conflictent pas entre elles
      if (data.type === AvailabilityType.DISPONIBLE && 
          conflict.type === AvailabilityType.DISPONIBLE) {
        return false;
      }
      
      // Les autres types conflictent
      return true;
    });

    if (significantConflicts.length > 0) {
      throw new ConflictError(
        `Conflit de disponibilité détecté avec ${significantConflicts.length} période(s) existante(s)`
      );
    }
  }

  /**
   * Obtenir l'ID du transporteur depuis l'utilisateur
   */
  private async getTransporteurId(userId: string, userRole: string): Promise<string> {
    if (userRole !== 'TRANSPORTEUR') {
      throw new AuthorizationError('Seuls les transporteurs peuvent gérer les disponibilités');
    }

    const transporteur = await prisma.transporteur.findUnique({
      where: { userId },
      select: { id: true }
    });

    if (!transporteur) {
      throw new NotFoundError('Profil transporteur');
    }

    return transporteur.id;
  }

  /**
   * Valider que le véhicule appartient au transporteur
   */
  private async validateVehicleOwnership(vehicleId: string, transporteurId: string): Promise<void> {
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        transporteurId,
        isActive: true
      }
    });

    if (!vehicle) {
      throw new NotFoundError('Véhicule ou véhicule non autorisé');
    }
  }

  /**
   * Valider l'accès à une disponibilité
   */
  private async validateAvailabilityAccess(
    availabilityId: string,
    userId: string,
    userRole: string
  ): Promise<any> {
    const transporteurId = await this.getTransporteurId(userId, userRole);

    const availability = await prisma.availability.findFirst({
      where: {
        id: availabilityId,
        transporteurId
      }
    });

    if (!availability) {
      throw new NotFoundError('Disponibilité');
    }

    return availability;
  }

  /**
   * Mettre à jour le statut du véhicule selon la disponibilité
   */
  private async updateVehicleStatusFromAvailability(
    vehicleId: string,
    availabilityType: AvailabilityType
  ): Promise<void> {
    let vehicleStatus: VehicleStatus;

    switch (availabilityType) {
      case AvailabilityType.DISPONIBLE:
        vehicleStatus = VehicleStatus.DISPONIBLE;
        break;
      case AvailabilityType.OCCUPE:
        vehicleStatus = VehicleStatus.EN_COURS;
        break;
      case AvailabilityType.MAINTENANCE:
        vehicleStatus = VehicleStatus.MAINTENANCE;
        break;
      default:
        vehicleStatus = VehicleStatus.HORS_SERVICE;
    }

    await prisma.vehicle.update({
      where: { id: vehicleId },
      data: { status: vehicleStatus }
    });
  }

  /**
   * Trouver les véhicules disponibles pour une période
   */
  private async findAvailableVehicles(
    transporteurId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any[]> {
    // Récupérer tous les véhicules du transporteur
    const allVehicles = await prisma.vehicle.findMany({
      where: {
        transporteurId,
        isActive: true,
        status: { in: [VehicleStatus.DISPONIBLE, VehicleStatus.RESERVE] }
      },
      select: {
        id: true,
        type: true,
        plateNumber: true,
        capacity: true
      }
    });

    // Vérifier les conflits pour chaque véhicule
    const availableVehicles = [];
    for (const vehicle of allVehicles) {
      const conflicts = await prisma.availability.findMany({
        where: {
          vehicleId: vehicle.id,
          type: { not: AvailabilityType.DISPONIBLE },
          startDate: { lte: endDate },
          endDate: { gte: startDate }
        }
      });

      if (conflicts.length === 0) {
        availableVehicles.push(vehicle);
      }
    }

    return availableVehicles;
  }

  /**
   * Générer les disponibilités récurrentes
   */
  private async generateRecurringAvailabilities(
    baseAvailabilityId: string,
    data: AvailabilityData
  ): Promise<void> {
    if (!data.isRecurring || !data.recurrencePattern) return;

    const maxOccurrences = 52; // Limiter à 1 an
    const occurrences = [];

    let currentStart = new Date(data.startDate);
    let currentEnd = new Date(data.endDate);

    for (let i = 1; i < maxOccurrences; i++) {
      // Calculer la prochaine occurrence
      switch (data.recurrencePattern) {
        case 'DAILY':
          currentStart.setDate(currentStart.getDate() + 1);
          currentEnd.setDate(currentEnd.getDate() + 1);
          break;
        case 'WEEKLY':
          currentStart.setDate(currentStart.getDate() + 7);
          currentEnd.setDate(currentEnd.getDate() + 7);
          break;
        case 'MONTHLY':
          currentStart.setMonth(currentStart.getMonth() + 1);
          currentEnd.setMonth(currentEnd.getMonth() + 1);
          break;
      }

      // Arrêter si on dépasse 1 an
      if (currentStart.getTime() > Date.now() + 365 * 24 * 60 * 60 * 1000) {
        break;
      }

      occurrences.push({
        transporteurId: data.transporteurId!,
        vehicleId: data.vehicleId,
        type: data.type,
        startDate: new Date(currentStart),
        endDate: new Date(currentEnd),
        startTime: data.startTime,
        endTime: data.endTime,
        isRecurring: false, // Les occurrences ne sont pas récurrentes
        notes: `${data.notes || ''} (Récurrence automatique)`.trim()
      });
    }

    // Créer toutes les occurrences
    if (occurrences.length > 0) {
      await prisma.availability.createMany({
        data: occurrences
      });
    }
  }

  /**
   * Parser une heure au format HH:mm
   */
  private parseTime(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Formater la réponse de disponibilité
   */
  private formatAvailabilityResponse(availability: any): AvailabilityResponse {
    return {
      id: availability.id,
      transporteurId: availability.transporteurId,
      vehicleId: availability.vehicleId,
      type: availability.type,
      startDate: availability.startDate,
      endDate: availability.endDate,
      startTime: availability.startTime,
      endTime: availability.endTime,
      isRecurring: availability.isRecurring,
      recurrencePattern: availability.recurrencePattern,
      notes: availability.notes,
      createdAt: availability.createdAt,
      updatedAt: availability.updatedAt
    };
  }
}

// Export de l'instance
export const availabilityService = new AvailabilityService();