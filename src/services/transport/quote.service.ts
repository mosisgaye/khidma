import { QuoteStatus, TransportOrderStatus } from '@prisma/client';
import { 
  CreateQuoteData,
  QuoteResponse,
  QuoteCalculation,
  PaginatedResponse
} from '@/types/transport.types';
import { 
  NotFoundError, 
  ValidationError, 
  AuthorizationError,
  ConflictError
} from '@/middleware/errorHandler';
import prisma from '@/config/database';
import { pricingService } from './pricing.service';
import crypto from 'crypto';

// ============ SERVICE GESTION DES DEVIS ============

export class QuoteService {

  // ============ CRÉATION DE DEVIS ============

  /**
   * Créer un devis pour une commande
   */
  async createQuote(
    transporteurId: string,
    userId: string,
    data: CreateQuoteData
  ): Promise<QuoteResponse> {
    // Vérifier que l'utilisateur est bien le transporteur
    await this.validateTransporteurAccess(transporteurId, userId);

    // Vérifier que la commande existe et peut recevoir des devis
    const order = await this.validateOrderForQuote(data.transportOrderId);

    // Vérifier qu'un devis n'existe pas déjà pour ce transporteur
    const existingQuote = await prisma.quote.findFirst({
      where: {
        transportOrderId: data.transportOrderId,
        transporteurId
      }
    });

    if (existingQuote) {
      throw new ConflictError('Un devis a déjà été soumis pour cette commande');
    }

    // Vérifier que le véhicule appartient au transporteur (si spécifié)
    if (data.vehicleId) {
      await this.validateVehicleOwnership(data.vehicleId, transporteurId);
    }

    // Valider les calculs de prix
    this.validateQuoteCalculation(data.calculation);

    // Générer un numéro de devis unique
    const quoteNumber = await this.generateQuoteNumber();

    // Créer le devis
    const quote = await prisma.quote.create({
      data: {
        quoteNumber,
        transportOrderId: data.transportOrderId,
        transporteurId,
        vehicleId: data.vehicleId,
        
        // Calculs détaillés
        basePrice: data.calculation.basePrice,
        distancePrice: data.calculation.distancePrice,
        weightPrice: data.calculation.weightPrice,
        volumePrice: data.calculation.volumePrice || 0,
        fuelSurcharge: data.calculation.fuelSurcharge,
        tollFees: data.calculation.tollFees,
        handlingFees: data.calculation.handlingFees,
        insuranceFees: data.calculation.insuranceFees,
        otherFees: data.calculation.otherFees,
        subtotal: data.calculation.subtotal,
        taxes: data.calculation.taxes,
        totalPrice: data.calculation.totalPrice,
        
        // Conditions
        validUntil: data.validUntil,
        paymentTerms: data.paymentTerms,
        deliveryTerms: data.deliveryTerms,
        conditions: data.conditions,
        
        status: QuoteStatus.BROUILLON,
        notes: data.notes
      }
    });

    return this.formatQuoteResponse(quote);
  }

  /**
   * Générer automatiquement un devis basé sur les prix du transporteur
   */
  async generateAutoQuote(
    transporteurId: string,
    userId: string,
    orderId: string,
    vehicleId?: string
  ): Promise<QuoteResponse> {
    // Vérifier l'accès
    await this.validateTransporteurAccess(transporteurId, userId);

    // Récupérer la commande
    const order = await this.validateOrderForQuote(orderId);

    // Récupérer le véhicule recommandé si non spécifié
    let selectedVehicleId = vehicleId;
    let selectedVehicle;

    if (!selectedVehicleId) {
      selectedVehicle = await this.findBestVehicleForOrder(transporteurId, order);
      selectedVehicleId = selectedVehicle?.id;
    } else {
      selectedVehicle = await this.validateVehicleOwnership(selectedVehicleId, transporteurId);
    }

    if (!selectedVehicle) {
      throw new ValidationError([{
        field: 'vehicle',
        message: 'Aucun véhicule adapté trouvé pour cette commande'
      }]);
    }

    // Calculer automatiquement le prix
    const calculation = await pricingService.calculateTransportPrice({
      transporteurId,
      vehicleType: selectedVehicle.type,
      goodsType: order.goodsType,
      weight: order.weight,
      volume: order.volume,
      distance: order.estimatedDistance || 0,
      departureDate: order.departureDate,
      isUrgent: order.priority === 'URGENT',
      specialRequirements: order.specialRequirements,
      declaredValue: order.declaredValue
    });

    // Créer le devis avec calcul automatique
    const validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours

    return await this.createQuote(transporteurId, userId, {
      transportOrderId: orderId,
      vehicleId: selectedVehicleId,
      calculation,
      validUntil,
      paymentTerms: 'Paiement à la livraison',
      deliveryTerms: 'Livraison selon planning convenu',
      conditions: 'Devis généré automatiquement selon nos tarifs en vigueur',
      notes: 'Devis généré automatiquement - Modifiable avant envoi'
    });
  }

  /**
   * Envoyer un devis à l'expéditeur
   */
  async sendQuote(
    quoteId: string,
    transporteurId: string,
    userId: string
  ): Promise<QuoteResponse> {
    // Vérifier l'accès
    await this.validateQuoteAccess(quoteId, transporteurId, userId);

    // Récupérer le devis
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId }
    });

    if (!quote) {
      throw new NotFoundError('Devis');
    }

    // Vérifier que le devis peut être envoyé
    if (quote.status !== QuoteStatus.BROUILLON) {
      throw new ValidationError([{
        field: 'status',
        message: 'Seuls les devis en brouillon peuvent être envoyés'
      }]);
    }

    // Vérifier que le devis n'a pas expiré
    if (quote.validUntil < new Date()) {
      throw new ValidationError([{
        field: 'validUntil',
        message: 'Le devis a expiré et doit être mis à jour'
      }]);
    }

    // Mettre à jour le statut et marquer comme envoyé
    const updatedQuote = await prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: QuoteStatus.ENVOYE,
        sentAt: new Date()
      }
    });

    // Mettre à jour le statut de la commande
    await prisma.transportOrder.update({
      where: { id: quote.transportOrderId },
      data: { status: TransportOrderStatus.DEVIS_ENVOYE }
    });

    // TODO: Envoyer notification à l'expéditeur
    await this.notifyQuoteSent(quote.transportOrderId, quoteId);

    return this.formatQuoteResponse(updatedQuote);
  }

  // ============ GESTION DES DEVIS ============

  /**
   * Mettre à jour un devis (seulement en brouillon)
   */
  async updateQuote(
    quoteId: string,
    transporteurId: string,
    userId: string,
    updates: Partial<CreateQuoteData>
  ): Promise<QuoteResponse> {
    // Vérifier l'accès
    const quote = await this.validateQuoteAccess(quoteId, transporteurId, userId);

    // Vérifier que le devis peut être modifié
    if (quote.status !== QuoteStatus.BROUILLON) {
      throw new ValidationError([{
        field: 'status',
        message: 'Seuls les devis en brouillon peuvent être modifiés'
      }]);
    }

    // Valider les nouveaux calculs si fournis
    if (updates.calculation) {
      this.validateQuoteCalculation(updates.calculation);
    }

    // Construire les données de mise à jour
    const updateData: any = {};

    if (updates.calculation) {
      Object.assign(updateData, {
        basePrice: updates.calculation.basePrice,
        distancePrice: updates.calculation.distancePrice,
        weightPrice: updates.calculation.weightPrice,
        volumePrice: updates.calculation.volumePrice || 0,
        fuelSurcharge: updates.calculation.fuelSurcharge,
        tollFees: updates.calculation.tollFees,
        handlingFees: updates.calculation.handlingFees,
        insuranceFees: updates.calculation.insuranceFees,
        otherFees: updates.calculation.otherFees,
        subtotal: updates.calculation.subtotal,
        taxes: updates.calculation.taxes,
        totalPrice: updates.calculation.totalPrice
      });
    }

    if (updates.validUntil !== undefined) updateData.validUntil = updates.validUntil;
    if (updates.paymentTerms !== undefined) updateData.paymentTerms = updates.paymentTerms;
    if (updates.deliveryTerms !== undefined) updateData.deliveryTerms = updates.deliveryTerms;
    if (updates.conditions !== undefined) updateData.conditions = updates.conditions;
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    if (updates.vehicleId !== undefined) {
      if (updates.vehicleId) {
        await this.validateVehicleOwnership(updates.vehicleId, transporteurId);
      }
      updateData.vehicleId = updates.vehicleId;
    }

    // Mettre à jour le devis
    const updatedQuote = await prisma.quote.update({
      where: { id: quoteId },
      data: {
        ...updateData,
        updatedAt: new Date()
      }
    });

    return this.formatQuoteResponse(updatedQuote);
  }

  /**
   * Supprimer un devis (seulement en brouillon)
   */
  async deleteQuote(
    quoteId: string,
    transporteurId: string,
    userId: string
  ): Promise<void> {
    // Vérifier l'accès
    const quote = await this.validateQuoteAccess(quoteId, transporteurId, userId);

    // Vérifier que le devis peut être supprimé
    if (quote.status !== QuoteStatus.BROUILLON) {
      throw new ValidationError([{
        field: 'status',
        message: 'Seuls les devis en brouillon peuvent être supprimés'
      }]);
    }

    // Supprimer le devis
    await prisma.quote.delete({
      where: { id: quoteId }
    });
  }

  // ============ ACTIONS SUR LES DEVIS ============

  /**
   * Accepter un devis (action de l'expéditeur)
   */
  async acceptQuote(
    quoteId: string,
    expediteurId: string,
    userId: string
  ): Promise<{
    quote: QuoteResponse;
    order: any;
  }> {
    // Vérifier l'accès de l'expéditeur
    await this.validateExpediteurAccess(expediteurId, userId);

    // Récupérer et valider le devis
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: {
        transportOrder: {
          include: {
            expediteur: true
          }
        }
      }
    });

    if (!quote) {
      throw new NotFoundError('Devis');
    }

    // Vérifier que l'expéditeur est propriétaire de la commande
    if (quote.transportOrder.expediteurId !== expediteurId) {
      throw new AuthorizationError('Vous ne pouvez accepter que vos propres devis');
    }

    // Vérifier que le devis peut être accepté
    if (quote.status !== QuoteStatus.ENVOYE) {
      throw new ValidationError([{
        field: 'status',
        message: 'Seuls les devis envoyés peuvent être acceptés'
      }]);
    }

    // Vérifier que le devis n'a pas expiré
    if (quote.validUntil < new Date()) {
      throw new ValidationError([{
        field: 'validUntil',
        message: 'Ce devis a expiré'
      }]);
    }

    // Transaction pour accepter le devis
    const result = await prisma.$transaction(async (tx) => {
      // Mettre à jour le devis
      const updatedQuote = await tx.quote.update({
        where: { id: quoteId },
        data: {
          status: QuoteStatus.ACCEPTE,
          respondedAt: new Date()
        }
      });

      // Refuser tous les autres devis pour cette commande
      await tx.quote.updateMany({
        where: {
          transportOrderId: quote.transportOrderId,
          id: { not: quoteId },
          status: QuoteStatus.ENVOYE
        },
        data: {
          status: QuoteStatus.REFUSE,
          respondedAt: new Date()
        }
      });

      // Mettre à jour la commande
      const updatedOrder = await tx.transportOrder.update({
        where: { id: quote.transportOrderId },
        data: {
          status: TransportOrderStatus.DEVIS_ACCEPTE,
          transporteurId: quote.transporteurId,
          vehicleId: quote.vehicleId,
          totalPrice: quote.totalPrice
        }
      });

      return { updatedQuote, updatedOrder };
    });

    // Notifier l'acceptation
    await this.notifyQuoteAccepted(quote.transportOrderId, quoteId);

    return {
      quote: this.formatQuoteResponse(result.updatedQuote),
      order: result.updatedOrder
    };
  }

  /**
   * Refuser un devis (action de l'expéditeur)
   */
  async rejectQuote(
    quoteId: string,
    expediteurId: string,
    userId: string,
    reason?: string
  ): Promise<QuoteResponse> {
    // Vérifier l'accès de l'expéditeur
    await this.validateExpediteurAccess(expediteurId, userId);

    // Récupérer et valider le devis
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: {
        transportOrder: {
          include: {
            expediteur: true
          }
        }
      }
    });

    if (!quote) {
      throw new NotFoundError('Devis');
    }

    // Vérifier que l'expéditeur est propriétaire de la commande
    if (quote.transportOrder.expediteurId !== expediteurId) {
      throw new AuthorizationError('Vous ne pouvez refuser que vos propres devis');
    }

    // Vérifier que le devis peut être refusé
    if (quote.status !== QuoteStatus.ENVOYE) {
      throw new ValidationError([{
        field: 'status',
        message: 'Seuls les devis envoyés peuvent être refusés'
      }]);
    }

    // Mettre à jour le devis
    const updatedQuote = await prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: QuoteStatus.REFUSE,
        respondedAt: new Date(),
        notes: reason ? `${quote.notes || ''}\nRaison du refus: ${reason}`.trim() : quote.notes
      }
    });

    // Notifier le refus
    await this.notifyQuoteRejected(quote.transportOrderId, quoteId, reason);

    return this.formatQuoteResponse(updatedQuote);
  }

  // ============ CONSULTATION DES DEVIS ============

  /**
   * Récupérer les devis d'un transporteur
   */
  async getTransporteurQuotes(
    transporteurId: string,
    userId: string,
    filters: {
      status?: QuoteStatus[];
      orderId?: string;
      startDate?: Date;
      endDate?: Date;
      page?: number;
      limit?: number;
      sortBy?: 'date' | 'price' | 'status';
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<PaginatedResponse<QuoteResponse & { orderInfo: any }>> {
    // Vérifier l'accès
    await this.validateTransporteurAccess(transporteurId, userId);

    const { 
      page = 1, 
      limit = 10, 
      sortBy = 'date', 
      sortOrder = 'desc',
      ...otherFilters 
    } = filters;
    
    const skip = (page - 1) * limit;

    // Construire les conditions de filtrage
    const whereCondition: any = {
      transporteurId,
      ...(otherFilters.status && { status: { in: otherFilters.status } }),
      ...(otherFilters.orderId && { transportOrderId: otherFilters.orderId }),
      ...(otherFilters.startDate && { createdAt: { gte: otherFilters.startDate } }),
      ...(otherFilters.endDate && { createdAt: { lte: otherFilters.endDate } })
    };

    // Définir l'ordre de tri
    let orderBy: any = {};
    switch (sortBy) {
      case 'price':
        orderBy = { totalPrice: sortOrder };
        break;
      case 'status':
        orderBy = { status: sortOrder };
        break;
      default:
        orderBy = { createdAt: sortOrder };
    }

    // Récupérer les devis
    const [quotes, total] = await Promise.all([
      prisma.quote.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy,
        include: {
          transportOrder: {
            select: {
              orderNumber: true,
              goodsType: true,
              weight: true,
              departureDate: true,
              status: true,
              departureAddress: {
                select: { city: true, region: true }
              },
              destinationAddress: {
                select: { city: true, region: true }
              },
              expediteur: {
                include: {
                  user: {
                    select: { firstName: true, lastName: true }
                  }
                }
              }
            }
          }
        }
      }),
      prisma.quote.count({ where: whereCondition })
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: quotes.map(quote => ({
        ...this.formatQuoteResponse(quote),
        orderInfo: {
          orderNumber: quote.transportOrder.orderNumber,
          goodsType: quote.transportOrder.goodsType,
          weight: quote.transportOrder.weight,
          departureDate: quote.transportOrder.departureDate,
          status: quote.transportOrder.status,
          route: `${quote.transportOrder.departureAddress.city} → ${quote.transportOrder.destinationAddress.city}`,
          expediteur: `${quote.transportOrder.expediteur.user.firstName} ${quote.transportOrder.expediteur.user.lastName}`
        }
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
   * Récupérer les devis d'une commande
   */
  async getOrderQuotes(
    orderId: string,
    expediteurId: string,
    userId: string
  ): Promise<Array<QuoteResponse & { transporteurInfo: any }>> {
    // Vérifier l'accès de l'expéditeur
    await this.validateExpediteurAccess(expediteurId, userId);

    // Vérifier que la commande appartient à l'expéditeur
    const order = await prisma.transportOrder.findFirst({
      where: {
        id: orderId,
        expediteurId
      }
    });

    if (!order) {
      throw new NotFoundError('Commande de transport');
    }

    // Récupérer les devis
    const quotes = await prisma.quote.findMany({
      where: {
        transportOrderId: orderId,
        status: { not: QuoteStatus.BROUILLON }
      },
      include: {
        transporteur: {
          include: {
            user: {
              select: { firstName: true, lastName: true }
            }
          }
        },
        vehicle: {
          select: {
            type: true,
            brand: true,
            model: true,
            plateNumber: true,
            capacity: true
          }
        }
      },
      orderBy: { totalPrice: 'asc' }
    });

    return quotes.map(quote => ({
      ...this.formatQuoteResponse(quote),
      transporteurInfo: {
        id: quote.transporteur.id,
        companyName: quote.transporteur.companyName,
        rating: quote.transporteur.rating,
        totalRides: quote.transporteur.totalRides,
        completionRate: quote.transporteur.completionRate,
        user: quote.transporteur.user,
        vehicle: quote.vehicle
      }
    }));
  }

  // ============ MÉTHODES PRIVÉES ============

  /**
   * Valider qu'une commande peut recevoir des devis
   */
  private async validateOrderForQuote(orderId: string): Promise<any> {
    const order = await prisma.transportOrder.findUnique({
      where: { id: orderId },
      include: {
        departureAddress: true,
        destinationAddress: true
      }
    });

    if (!order) {
      throw new NotFoundError('Commande de transport');
    }

    // Vérifier que la commande est dans un état compatible
    const validStatuses = [
      TransportOrderStatus.DEMANDE,
      TransportOrderStatus.DEVIS_ENVOYE
    ];

    if (!validStatuses.includes(order.status)) {
      throw new ValidationError([{
        field: 'status',
        message: 'Cette commande ne peut plus recevoir de devis'
      }]);
    }

    return order;
  }

  /**
   * Trouver le meilleur véhicule pour une commande
   */
  private async findBestVehicleForOrder(transporteurId: string, order: any): Promise<any> {
    const weightInTons = order.weight / 1000;

    return await prisma.vehicle.findFirst({
      where: {
        transporteurId,
        isActive: true,
        status: { in: ['DISPONIBLE', 'RESERVE'] },
        capacity: { gte: weightInTons }
      },
      orderBy: [
        { capacity: 'asc' }, // Préférer le véhicule le plus adapté
        { dailyRate: 'asc' }  // Puis le moins cher
      ]
    });
  }

  /**
   * Valider les calculs d'un devis
   */
  private validateQuoteCalculation(calculation: QuoteCalculation): void {
    const errors: any[] = [];

    // Vérifier que tous les montants sont positifs
    const amounts = [
      { field: 'basePrice', value: calculation.basePrice },
      { field: 'distancePrice', value: calculation.distancePrice },
      { field: 'weightPrice', value: calculation.weightPrice },
      { field: 'totalPrice', value: calculation.totalPrice }
    ];

    amounts.forEach(({ field, value }) => {
      if (value < 0) {
        errors.push({
          field,
          message: `${field} ne peut pas être négatif`
        });
      }
    });

    // Vérifier la cohérence des calculs
    const calculatedSubtotal = calculation.basePrice + calculation.distancePrice + 
                              calculation.weightPrice + (calculation.volumePrice || 0) +
                              calculation.fuelSurcharge + calculation.tollFees + 
                              calculation.handlingFees + calculation.insuranceFees + 
                              calculation.otherFees;

    if (Math.abs(calculatedSubtotal - calculation.subtotal) > 1) {
      errors.push({
        field: 'subtotal',
        message: 'Le sous-total ne correspond pas à la somme des éléments'
      });
    }

    const calculatedTotal = calculation.subtotal + calculation.taxes;
    if (Math.abs(calculatedTotal - calculation.totalPrice) > 1) {
      errors.push({
        field: 'totalPrice',
        message: 'Le prix total ne correspond pas au sous-total + taxes'
      });
    }

    if (errors.length > 0) {
      throw new ValidationError(errors);
    }
  }

  /**
   * Générer un numéro de devis unique
   */
  private async generateQuoteNumber(): Promise<string> {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    // Compter les devis du jour
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    
    const todayCount = await prisma.quote.count({
      where: {
        createdAt: {
          gte: startOfDay,
          lt: endOfDay
        }
      }
    });

    const sequence = (todayCount + 1).toString().padStart(4, '0');
    return `DV${year}${month}${day}${sequence}`;
  }

  /**
   * Valider l'accès transporteur
   */
  private async validateTransporteurAccess(transporteurId: string, userId: string): Promise<void> {
    const transporteur = await prisma.transporteur.findFirst({
      where: {
        id: transporteurId,
        userId
      }
    });

    if (!transporteur) {
      throw new AuthorizationError('Accès non autorisé à ce profil transporteur');
    }
  }

  /**
   * Valider l'accès expéditeur
   */
  private async validateExpediteurAccess(expediteurId: string, userId: string): Promise<void> {
    const expediteur = await prisma.expediteur.findFirst({
      where: {
        id: expediteurId,
        userId
      }
    });

    if (!expediteur) {
      throw new AuthorizationError('Accès non autorisé à ce profil expéditeur');
    }
  }

  /**
   * Valider l'accès à un devis
   */
  private async validateQuoteAccess(quoteId: string, transporteurId: string, userId: string): Promise<any> {
    await this.validateTransporteurAccess(transporteurId, userId);

    const quote = await prisma.quote.findFirst({
      where: {
        id: quoteId,
        transporteurId
      }
    });

    if (!quote) {
      throw new NotFoundError('Devis');
    }

    return quote;
  }

  /**
   * Valider la propriété d'un véhicule
   */
  private async validateVehicleOwnership(vehicleId: string, transporteurId: string): Promise<any> {
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

    return vehicle;
  }

  /**
   * Notifier l'envoi d'un devis
   */
  private async notifyQuoteSent(orderId: string, quoteId: string): Promise<void> {
    // TODO: Implémenter l'envoi de notifications
    console.log(`Notification: Nouveau devis ${quoteId} pour commande ${orderId}`);
  }

  /**
   * Notifier l'acceptation d'un devis
   */
  private async notifyQuoteAccepted(orderId: string, quoteId: string): Promise<void> {
    // TODO: Implémenter l'envoi de notifications
    console.log(`Notification: Devis ${quoteId} accepté pour commande ${orderId}`);
  }

  /**
   * Notifier le refus d'un devis
   */
  private async notifyQuoteRejected(orderId: string, quoteId: string, reason?: string): Promise<void> {
    // TODO: Implémenter l'envoi de notifications
    console.log(`Notification: Devis ${quoteId} refusé pour commande ${orderId}. Raison: ${reason || 'Non spécifiée'}`);
  }

  /**
   * Formater la réponse de devis
   */
  private formatQuoteResponse(quote: any): QuoteResponse {
    return {
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      transportOrderId: quote.transportOrderId,
      transporteurId: quote.transporteurId,
      vehicleId: quote.vehicleId,
      calculation: {
        basePrice: quote.basePrice,
        distancePrice: quote.distancePrice,
        weightPrice: quote.weightPrice,
        volumePrice: quote.volumePrice,
        fuelSurcharge: quote.fuelSurcharge,
        tollFees: quote.tollFees,
        handlingFees: quote.handlingFees,
        insuranceFees: quote.insuranceFees,
        otherFees: quote.otherFees,
        subtotal: quote.subtotal,
        taxes: quote.taxes,
        totalPrice: quote.totalPrice
      },
      validUntil: quote.validUntil,
      paymentTerms: quote.paymentTerms,
      deliveryTerms: quote.deliveryTerms,
      conditions: quote.conditions,
      notes: quote.notes,
      status: quote.status,
      sentAt: quote.sentAt,
      viewedAt: quote.viewedAt,
      respondedAt: quote.respondedAt,
      createdAt: quote.createdAt,
      updatedAt: quote.updatedAt
    };
  }
}

// Export de l'instance
export const quoteService = new QuoteService();