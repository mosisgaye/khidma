import { TransportOrderStatus } from '@prisma/client';
import { 
  TrackingEvent,
  Coordinates,
  DistanceMatrix
} from '@/types/transport.types';
import { NotFoundError, ValidationError, AuthorizationError } from '@/middleware/errorHandler';
import prisma from '@/config/database';
import { geolocationService } from './geolocation.service';
import { redisUtils } from '@/config/redis';

// ============ SERVICE SUIVI GPS TEMPS RÉEL ============

export class TrackingService {

  // ============ SUIVI TEMPS RÉEL ============

  /**
   * Mettre à jour la position en temps réel
   */
  async updateRealtimePosition(
    orderId: string,
    transporteurId: string,
    position: {
      latitude: number;
      longitude: number;
      timestamp: Date;
      speed?: number; // km/h
      heading?: number; // degrés
      accuracy?: number; // mètres
    }
  ): Promise<{
    success: boolean;
    estimatedArrival?: Date;
    distanceRemaining?: number;
    nextCheckpoint?: string;
  }> {
    // Vérifier que la commande existe et appartient au transporteur
    const order = await this.validateOrderAccess(orderId, transporteurId);

    if (!['EN_TRANSIT', 'EN_PREPARATION'].includes(order.status)) {
      throw new ValidationError([{
        field: 'status',
        message: 'Le suivi n\'est disponible que pour les commandes en transit'
      }]);
    }

    // Stocker la position en temps réel dans Redis
    const positionKey = `tracking:${orderId}:position`;
    const positionData = {
      latitude: position.latitude,
      longitude: position.longitude,
      timestamp: position.timestamp.toISOString(),
      speed: position.speed || 0,
      heading: position.heading || 0,
      accuracy: position.accuracy || 10
    };

    await redisUtils.setWithExpiry(positionKey, JSON.stringify(positionData), 3600); // 1h

    // Calculer la distance restante vers la destination
    const destination = {
      latitude: order.destinationAddress.latitude!,
      longitude: order.destinationAddress.longitude!
    };

    const distanceMatrix = geolocationService.calculateDistance(
      { latitude: position.latitude, longitude: position.longitude },
      destination
    );

    // Estimer l'heure d'arrivée
    const estimatedArrival = this.calculateEstimatedArrival(
      distanceMatrix.distance,
      position.speed || 50 // vitesse par défaut si non fournie
    );

    // Vérifier si on est proche de checkpoints importants
    const nextCheckpoint = await this.checkNearbyCheckpoints(orderId, position);

    // Mettre à jour le cache de suivi
    const trackingData = {
      orderId,
      currentPosition: position,
      distanceRemaining: distanceMatrix.distance,
      estimatedArrival,
      lastUpdate: new Date(),
      nextCheckpoint
    };

    await redisUtils.setWithExpiry(
      `tracking:${orderId}:data`,
      JSON.stringify(trackingData),
      7200 // 2h
    );

    // Déclencher des notifications si nécessaire
    await this.checkNotificationTriggers(order, position, distanceMatrix.distance);

    return {
      success: true,
      estimatedArrival,
      distanceRemaining: distanceMatrix.distance,
      nextCheckpoint
    };
  }

  /**
   * Récupérer la position actuelle d'une commande
   */
  async getCurrentPosition(orderId: string, userId?: string): Promise<{
    position: Coordinates & { 
      timestamp: Date;
      speed?: number;
      heading?: number;
    };
    distanceRemaining?: number;
    estimatedArrival?: Date;
    route?: Coordinates[];
  } | null> {
    // Vérifier l'accès à la commande
    if (userId) {
      await this.validateUserAccess(orderId, userId);
    }

    // Récupérer depuis Redis
    const positionData = await redisUtils.get(`tracking:${orderId}:position`);
    const trackingData = await redisUtils.get(`tracking:${orderId}:data`);

    if (!positionData) {
      return null;
    }

    const position = JSON.parse(positionData);
    const tracking = trackingData ? JSON.parse(trackingData) : null;

    return {
      position: {
        latitude: position.latitude,
        longitude: position.longitude,
        timestamp: new Date(position.timestamp),
        speed: position.speed,
        heading: position.heading
      },
      distanceRemaining: tracking?.distanceRemaining,
      estimatedArrival: tracking?.estimatedArrival ? new Date(tracking.estimatedArrival) : undefined,
      route: await this.getRouteCoordinates(orderId)
    };
  }

  /**
   * Obtenir l'historique de tracking d'une commande
   */
  async getTrackingHistory(orderId: string, userId?: string): Promise<{
    events: TrackingEvent[];
    totalDistance?: number;
    totalDuration?: number;
    averageSpeed?: number;
  }> {
    // Vérifier l'accès
    if (userId) {
      await this.validateUserAccess(orderId, userId);
    }

    // Récupérer les événements de tracking
    const events = await prisma.trackingEvent.findMany({
      where: {
        transportOrderId: orderId,
        isPublic: true
      },
      orderBy: { timestamp: 'asc' }
    });

    // Calculer les statistiques du voyage
    const stats = await this.calculateTripStatistics(events);

    return {
      events: events.map(event => ({
        id: event.id,
        transportOrderId: event.transportOrderId,
        eventType: event.eventType as any,
        location: event.location,
        address: event.address || undefined,
        coordinates: event.latitude && event.longitude ? {
          latitude: event.latitude,
          longitude: event.longitude
        } : undefined,
        description: event.description,
        images: event.images,
        signature: event.signature || undefined,
        contactPerson: event.contactPerson || undefined,
        isPublic: event.isPublic,
        timestamp: event.timestamp
      })),
      ...stats
    };
  }

  // ============ GESTION DES ÉVÉNEMENTS ============

  /**
   * Créer un événement de tracking
   */
  async createTrackingEvent(data: {
    transportOrderId: string;
    transporteurId: string;
    eventType: 'PICKUP' | 'TRANSIT' | 'DELIVERY' | 'ISSUE' | 'DELAY';
    location: string;
    address?: string;
    coordinates?: Coordinates;
    description: string;
    images?: string[];
    signature?: string;
    contactPerson?: string;
    isPublic?: boolean;
  }): Promise<TrackingEvent> {
    // Vérifier l'accès
    await this.validateOrderAccess(data.transportOrderId, data.transporteurId);

    // Créer l'événement
    const event = await prisma.trackingEvent.create({
      data: {
        transportOrderId: data.transportOrderId,
        eventType: data.eventType,
        location: data.location,
        address: data.address,
        latitude: data.coordinates?.latitude,
        longitude: data.coordinates?.longitude,
        description: data.description,
        images: data.images || [],
        signature: data.signature,
        contactPerson: data.contactPerson,
        isPublic: data.isPublic !== false, // Public par défaut
        timestamp: new Date()
      }
    });

    // Mettre à jour le statut de la commande si nécessaire
    await this.updateOrderStatusFromEvent(data.transportOrderId, data.eventType);

    // Envoyer des notifications
    await this.notifyTrackingEvent(event);

    return {
      id: event.id,
      transportOrderId: event.transportOrderId,
      eventType: event.eventType as any,
      location: event.location,
      address: event.address || undefined,
      coordinates: event.latitude && event.longitude ? {
        latitude: event.latitude,
        longitude: event.longitude
      } : undefined,
      description: event.description,
      images: event.images,
      signature: event.signature || undefined,
      contactPerson: event.contactPerson || undefined,
      isPublic: event.isPublic,
      timestamp: event.timestamp
    };
  }

  /**
   * Marquer un point de passage
   */
  async markCheckpoint(
    orderId: string,
    transporteurId: string,
    checkpoint: {
      name: string;
      coordinates: Coordinates;
      timestamp: Date;
      notes?: string;
      images?: string[];
    }
  ): Promise<void> {
    await this.validateOrderAccess(orderId, transporteurId);

    await this.createTrackingEvent({
      transportOrderId: orderId,
      transporteurId,
      eventType: 'TRANSIT',
      location: checkpoint.name,
      coordinates: checkpoint.coordinates,
      description: `Passage au point: ${checkpoint.name}${checkpoint.notes ? ` - ${checkpoint.notes}` : ''}`,
      images: checkpoint.images,
      isPublic: true
    });

    // Mettre à jour la position dans Redis
    await this.updateRealtimePosition(orderId, transporteurId, {
      latitude: checkpoint.coordinates.latitude,
      longitude: checkpoint.coordinates.longitude,
      timestamp: checkpoint.timestamp
    });
  }

  // ============ GESTION DES SIGNATURES ============

  /**
   * Enregistrer une signature électronique
   */
  async recordSignature(
    orderId: string,
    transporteurId: string,
    signatureData: {
      signatureImage: string; // Base64 ou URL
      signatoryName: string;
      signatoryRole: string; // "Expéditeur", "Destinataire", "Témoin"
      location: string;
      coordinates?: Coordinates;
      timestamp: Date;
    }
  ): Promise<{
    signatureId: string;
    signatureUrl: string;
  }> {
    await this.validateOrderAccess(orderId, transporteurId);

    // TODO: Ici on devrait uploader l'image vers un service de stockage
    // Pour l'instant, on simule avec un ID et URL
    const signatureId = `sig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const signatureUrl = `/signatures/${signatureId}.png`;

    // Créer l'événement de signature
    await this.createTrackingEvent({
      transportOrderId: orderId,
      transporteurId,
      eventType: 'DELIVERY',
      location: signatureData.location,
      coordinates: signatureData.coordinates,
      description: `Signature électronique de ${signatureData.signatoryName} (${signatureData.signatoryRole})`,
      signature: signatureUrl,
      contactPerson: signatureData.signatoryName,
      isPublic: true
    });

    return {
      signatureId,
      signatureUrl
    };
  }

  // ============ MÉTHODES PRIVÉES ============

  /**
   * Calculer l'heure d'arrivée estimée
   */
  private calculateEstimatedArrival(distanceKm: number, speedKmh: number): Date {
    const hoursRemaining = distanceKm / Math.max(speedKmh, 10); // Éviter division par 0
    const minutesRemaining = hoursRemaining * 60;
    
    // Ajouter un buffer de 20% pour les imprévus
    const adjustedMinutes = minutesRemaining * 1.2;
    
    return new Date(Date.now() + adjustedMinutes * 60 * 1000);
  }

  /**
   * Vérifier les checkpoints proches
   */
  private async checkNearbyCheckpoints(
    orderId: string,
    position: Coordinates
  ): Promise<string | undefined> {
    // Récupérer la commande avec adresses
    const order = await prisma.transportOrder.findUnique({
      where: { id: orderId },
      include: {
        departureAddress: true,
        destinationAddress: true
      }
    });

    if (!order?.destinationAddress.latitude) return undefined;

    // Vérifier la distance vers la destination
    const distanceToDestination = geolocationService.calculateDistance(
      position,
      {
        latitude: order.destinationAddress.latitude,
        longitude: order.destinationAddress.longitude
      }
    );

    // Si on est à moins de 5km de la destination
    if (distanceToDestination.distance < 5) {
      return 'Proche de la destination';
    }

    // TODO: Ajouter d'autres checkpoints (péages, aires de repos, etc.)
    
    return undefined;
  }

  /**
   * Vérifier les déclencheurs de notification
   */
  private async checkNotificationTriggers(
    order: any,
    position: Coordinates,
    distanceRemaining: number
  ): Promise<void> {
    // Notification quand on arrive à destination (moins de 2km)
    if (distanceRemaining < 2) {
      // TODO: Envoyer notification "Livraison imminente"
      console.log(`Notification: Livraison imminente pour commande ${order.orderNumber}`);
    }

    // Notification si retard détecté
    const now = new Date();
    if (order.deliveryDate && now > order.deliveryDate && distanceRemaining > 0) {
      // TODO: Envoyer notification de retard
      console.log(`Notification: Retard détecté pour commande ${order.orderNumber}`);
    }
  }

  /**
   * Calculer les statistiques du voyage
   */
  private async calculateTripStatistics(events: any[]): Promise<{
    totalDistance?: number;
    totalDuration?: number;
    averageSpeed?: number;
  }> {
    if (events.length < 2) {
      return {};
    }

    // Filtrer les événements avec coordonnées
    const eventsWithCoords = events.filter(e => e.latitude && e.longitude);
    
    if (eventsWithCoords.length < 2) {
      return {};
    }

    // Calculer la distance totale
    let totalDistance = 0;
    for (let i = 1; i < eventsWithCoords.length; i++) {
      const prev = eventsWithCoords[i - 1];
      const curr = eventsWithCoords[i];
      
      const distance = geolocationService.calculateDistance(
        { latitude: prev.latitude, longitude: prev.longitude },
        { latitude: curr.latitude, longitude: curr.longitude }
      );
      
      totalDistance += distance.distance;
    }

    // Calculer la durée totale
    const startTime = new Date(events[0].timestamp);
    const endTime = new Date(events[events.length - 1].timestamp);
    const totalDurationMs = endTime.getTime() - startTime.getTime();
    const totalDurationHours = totalDurationMs / (1000 * 60 * 60);

    // Calculer la vitesse moyenne
    const averageSpeed = totalDurationHours > 0 ? totalDistance / totalDurationHours : 0;

    return {
      totalDistance: Math.round(totalDistance * 100) / 100,
      totalDuration: Math.round(totalDurationHours * 100) / 100,
      averageSpeed: Math.round(averageSpeed * 100) / 100
    };
  }

  /**
   * Récupérer les coordonnées de la route
   */
  private async getRouteCoordinates(orderId: string): Promise<Coordinates[]> {
    // Récupérer les événements avec coordonnées
    const events = await prisma.trackingEvent.findMany({
      where: {
        transportOrderId: orderId,
        latitude: { not: null },
        longitude: { not: null }
      },
      orderBy: { timestamp: 'asc' },
      select: {
        latitude: true,
        longitude: true,
        timestamp: true
      }
    });

    return events.map(event => ({
      latitude: event.latitude!,
      longitude: event.longitude!
    }));
  }

  /**
   * Mettre à jour le statut de commande selon l'événement
   */
  private async updateOrderStatusFromEvent(
    orderId: string,
    eventType: string
  ): Promise<void> {
    let newStatus: TransportOrderStatus | null = null;

    switch (eventType) {
      case 'PICKUP':
        newStatus = TransportOrderStatus.EN_TRANSIT;
        break;
      case 'DELIVERY':
        newStatus = TransportOrderStatus.LIVRE;
        break;
    }

    if (newStatus) {
      await prisma.transportOrder.update({
        where: { id: orderId },
        data: { 
          status: newStatus,
          ...(newStatus === TransportOrderStatus.EN_TRANSIT && { startedAt: new Date() }),
          ...(newStatus === TransportOrderStatus.LIVRE && { completedAt: new Date() })
        }
      });
    }
  }

  /**
   * Envoyer les notifications pour un événement
   */
  private async notifyTrackingEvent(event: any): Promise<void> {
    // TODO: Implémenter l'envoi de notifications
    console.log(`Notification tracking: ${event.eventType} - ${event.description}`);
  }

  /**
   * Valider l'accès à une commande pour un transporteur
   */
  private async validateOrderAccess(orderId: string, transporteurId: string): Promise<any> {
    const order = await prisma.transportOrder.findUnique({
      where: { id: orderId },
      include: {
        transporteur: true,
        departureAddress: true,
        destinationAddress: true
      }
    });

    if (!order) {
      throw new NotFoundError('Commande de transport');
    }

    if (order.transporteurId !== transporteurId) {
      throw new AuthorizationError('Accès non autorisé à cette commande');
    }

    return order;
  }

  /**
   * Valider l'accès utilisateur à une commande
   */
  private async validateUserAccess(orderId: string, userId: string): Promise<void> {
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

    const hasAccess = order.expediteur.user.id === userId ||
                     (order.transporteur && order.transporteur.user.id === userId);

    if (!hasAccess) {
      throw new AuthorizationError('Accès non autorisé à cette commande');
    }
  }
}

// Export de l'instance
export const trackingService = new TrackingService();