import { TransportOrderStatus } from '@prisma/client';
import { transportOrderService } from './order.service';
import { vehicleService } from './vehicle.service';
import { pricingService } from './pricing.service';
import { trackingService } from './tracking.service';
import { reviewService } from './review.service';
import { availabilityService } from './availability.service';
import { quoteService } from './quote.service';
import { searchService } from './search.service';
import { transportNotificationService } from './notification.service';
import { geolocationService } from './geolocation.service';

// ============ SERVICE D'INTÉGRATION TRANSPORT ============

export class TransportIntegrationService {

  // ============ WORKFLOWS COMPLETS ============

  /**
   * Workflow complet: Création de commande → Devis automatiques → Notification
   */
  async createOrderWithAutoQuotes(
    expediteurId: string,
    orderData: any
  ): Promise<{
    order: any;
    autoQuotes: any[];
    notifications: string[];
  }> {
    // 1. Créer la commande
    const order = await transportOrderService.createOrder(expediteurId, orderData);

    // 2. Générer des devis automatiques pour les transporteurs adaptés
    const autoQuotes = await pricingService.calculateQuotesForOrder(order.id);

    // 3. Créer les devis dans la base
    const createdQuotes = [];
    for (const autoQuote of autoQuotes.slice(0, 5)) { // Limiter à 5 devis
      try {
        const quote = await quoteService.generateAutoQuote(
          autoQuote.transporteurId,
          autoQuote.transporteur.user.id,
          order.id,
          autoQuote.vehicle.id
        );
        
        // Envoyer automatiquement les meilleurs devis
        if (autoQuote.quote.totalPrice <= autoQuotes[0].quote.totalPrice * 1.2) {
          await quoteService.sendQuote(quote.id, autoQuote.transporteurId, autoQuote.transporteur.user.id);
        }
        
        createdQuotes.push(quote);
      } catch (error) {
        console.error(`Erreur création devis automatique pour ${autoQuote.transporteurId}:`, error);
      }
    }

    return {
      order,
      autoQuotes: createdQuotes,
      notifications: [`${createdQuotes.length} devis automatiques créés`]
    };
  }

  /**
   * Workflow complet: Acceptation devis → Assignation → Planification
   */
  async acceptQuoteAndPlanTransport(
    quoteId: string,
    expediteurId: string,
    userId: string
  ): Promise<{
    quote: any;
    order: any;
    availability: any;
    notifications: string[];
  }> {
    // 1. Accepter le devis
    const { quote, order } = await quoteService.acceptQuote(quoteId, expediteurId, userId);

    // 2. Assigner automatiquement la commande
    const assignedOrder = await transportOrderService.assignOrder(
      order.id,
      quote.transporteurId,
      quote.vehicleId!,
      order.deliveryDate
    );

    // 3. Planifier les disponibilités
    const availability = await availabilityService.autoMarkBusyForOrder(
      order.id,
      quote.transporteurId,
      quote.vehicleId!
    );

    return {
      quote,
      order: assignedOrder,
      availability,
      notifications: [
        'Devis accepté',
        'Commande assignée automatiquement',
        'Disponibilités mises à jour'
      ]
    };
  }

  /**
   * Workflow complet: Transport → Suivi → Livraison → Évaluation
   */
  async completeTransportWorkflow(
    orderId: string,
    transporteurId: string,
    completionData: {
      deliveryProof?: string[];
      signature?: string;
      notes?: string;
      finalLocation?: { latitude: number; longitude: number };
    }
  ): Promise<{
    order: any;
    trackingEvent: any;
    availability: any;
    notifications: string[];
  }> {
    // 1. Marquer comme livré
    const order = await transportOrderService.completeOrder(
      orderId,
      transporteurId,
      completionData
    );

    // 2. Créer l'événement de tracking final
    const trackingEvent = await trackingService.createTrackingEvent({
      transportOrderId: orderId,
      transporteurId,
      eventType: 'DELIVERY',
      location: 'Destination',
      coordinates: completionData.finalLocation,
      description: 'Livraison effectuée avec succès',
      images: completionData.deliveryProof,
      signature: completionData.signature,
      isPublic: true
    });

    // 3. Libérer les disponibilités
    if (order.vehicleId) {
      await availabilityService.autoReleaseAfterOrder(orderId, transporteurId, order.vehicleId);
    }

    // 4. Planifier les rappels d'évaluation (après 2h)
    setTimeout(async () => {
      await this.scheduleReviewReminders(orderId);
    }, 2 * 60 * 60 * 1000);

    return {
      order,
      trackingEvent,
      availability: 'released',
      notifications: [
        'Commande livrée',
        'Suivi mis à jour',
        'Véhicule libéré',
        'Rappels d\'évaluation programmés'
      ]
    };
  }

  // ============ OPTIMISATIONS AUTOMATIQUES ============

  /**
   * Optimiser automatiquement les opérations d'un transporteur
   */
  async optimizeTransporteurOperations(transporteurId: string, userId: string): Promise<{
    fleetOptimization: any;
    pricingOptimization: any;
    availabilityOptimization: any;
    recommendations: string[];
  }> {
    // 1. Optimiser la flotte
    const fleetOptimization = await vehicleService.optimizeFleetUtilization(transporteurId);

    // 2. Optimiser les prix
    const pricingOptimization = await pricingService.optimizePricingForTransporteur(transporteurId);

    // 3. Analyser les disponibilités
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const now = new Date();
    
    const { isAvailable, availableVehicles } = await availabilityService.checkAvailabilityForPeriod(
      transporteurId,
      now,
      new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 prochains jours
    );

    // 4. Générer des recommandations consolidées
    const recommendations = [
      ...fleetOptimization.recommendations.map(r => r.recommendation),
      ...pricingOptimization.recommendations,
      `${availableVehicles.length} véhicules disponibles cette semaine`
    ];

    return {
      fleetOptimization,
      pricingOptimization,
      availabilityOptimization: {
        isAvailable,
        availableVehicles: availableVehicles.length,
        utilizationRate: fleetOptimization.fleetOverview.utilizationRate
      },
      recommendations
    };
  }

  /**
   * Suggérer des améliorations pour un expéditeur
   */
  async suggestExpeditorImprovements(expediteurId: string, userId: string): Promise<{
    routeOptimization: any;
    costAnalysis: any;
    transporteurRecommendations: any;
    suggestions: string[];
  }> {
    // 1. Analyser les routes habituelles
    const routeOptimization = await this.analyzeFrequentRoutes(expediteurId);

    // 2. Analyser les coûts
    const costAnalysis = await this.analyzeCostEfficiency(expediteurId);

    // 3. Recommander des transporteurs
    const transporteurRecommendations = await searchService.getRecommendations(userId, 'EXPEDITEUR');

    // 4. Générer des suggestions
    const suggestions = [
      ...routeOptimization.recommendations,
      ...costAnalysis.recommendations,
      'Nouveaux transporteurs recommandés disponibles'
    ];

    return {
      routeOptimization,
      costAnalysis,
      transporteurRecommendations,
      suggestions
    };
  }

  // ============ ANALYSE ET REPORTING ============

  /**
   * Générer un rapport complet d'activité transport
   */
  async generateActivityReport(
    userId: string,
    userRole: string,
    period: { startDate: Date; endDate: Date }
  ): Promise<{
    summary: any;
    performance: any;
    financials: any;
    recommendations: string[];
  }> {
    if (userRole === 'TRANSPORTEUR') {
      return await this.generateTransporteurReport(userId, period);
    } else if (userRole === 'EXPEDITEUR') {
      return await this.generateExpediteurReport(userId, period);
    }

    throw new Error('Rôle non supporté pour les rapports');
  }

  /**
   * Détecter et prévenir les problèmes
   */
  async detectAndPreventIssues(): Promise<{
    maintenanceAlerts: any[];
    priceAlerts: any[];
    availabilityAlerts: any[];
    qualityAlerts: any[];
  }> {
    // 1. Alertes de maintenance
    const maintenanceAlerts = await this.detectMaintenanceIssues();

    // 2. Alertes de prix
    const priceAlerts = await this.detectPricingIssues();

    // 3. Alertes de disponibilité
    const availabilityAlerts = await this.detectAvailabilityIssues();

    // 4. Alertes de qualité
    const qualityAlerts = await this.detectQualityIssues();

    return {
      maintenanceAlerts,
      priceAlerts,
      availabilityAlerts,
      qualityAlerts
    };
  }

  // ============ MÉTHODES PRIVÉES ============

  /**
   * Programmer les rappels d'évaluation
   */
  private async scheduleReviewReminders(orderId: string): Promise<void> {
    // TODO: Implémenter avec un système de tâches programmées
    console.log(`Rappels d'évaluation programmés pour commande ${orderId}`);
  }

  /**
   * Analyser les routes fréquentes
   */
  private async analyzeFrequentRoutes(expediteurId: string): Promise<any> {
    // TODO: Implémenter l'analyse des routes
    return {
      mostUsedRoutes: [],
      costPerRoute: {},
      recommendations: ['Optimiser les trajets de retour']
    };
  }

  /**
   * Analyser l'efficacité des coûts
   */
  private async analyzeCostEfficiency(expediteurId: string): Promise<any> {
    // TODO: Implémenter l'analyse des coûts
    return {
      averageCostPerKm: 0,
      costTrends: [],
      recommendations: ['Négocier des tarifs préférentiels']
    };
  }

  /**
   * Générer un rapport transporteur
   */
  private async generateTransporteurReport(userId: string, period: any): Promise<any> {
    // TODO: Implémenter le rapport transporteur
    return {
      summary: { totalOrders: 0, revenue: 0 },
      performance: { rating: 0, completionRate: 0 },
      financials: { totalRevenue: 0, expenses: 0 },
      recommendations: []
    };
  }

  /**
   * Générer un rapport expéditeur
   */
  private async generateExpediteurReport(userId: string, period: any): Promise<any> {
    // TODO: Implémenter le rapport expéditeur
    return {
      summary: { totalShipments: 0, totalCost: 0 },
      performance: { onTimeRate: 0, satisfaction: 0 },
      financials: { totalSpent: 0, savings: 0 },
      recommendations: []
    };
  }

  /**
   * Détecter les problèmes de maintenance
   */
  private async detectMaintenanceIssues(): Promise<any[]> {
    // TODO: Implémenter la détection des problèmes de maintenance
    return [];
  }

  /**
   * Détecter les problèmes de prix
   */
  private async detectPricingIssues(): Promise<any[]> {
    // TODO: Implémenter la détection des problèmes de prix
    return [];
  }

  /**
   * Détecter les problèmes de disponibilité
   */
  private async detectAvailabilityIssues(): Promise<any[]> {
    // TODO: Implémenter la détection des problèmes de disponibilité
    return [];
  }

  /**
   * Détecter les problèmes de qualité
   */
  private async detectQualityIssues(): Promise<any[]> {
    // TODO: Implémenter la détection des problèmes de qualité
    return [];
  }
}

// Export de l'instance
export const transportIntegrationService = new TransportIntegrationService();