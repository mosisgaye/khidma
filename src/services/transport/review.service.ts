import { TransportOrderStatus } from '@prisma/client';
import { 
  ReviewData,
  ReviewResponse,
  PaginatedResponse
} from '@/types/transport.types';
import { 
  NotFoundError, 
  ValidationError, 
  AuthorizationError,
  ConflictError
} from '@/middleware/errorHandler';
import prisma from '@/config/database';

// ============ SERVICE ÉVALUATIONS ET NOTATIONS ============

export class ReviewService {

  // ============ CRÉATION D'ÉVALUATIONS ============

  /**
   * Créer une évaluation pour un transporteur
   */
  async createReview(
    reviewerId: string,
    reviewerRole: 'EXPEDITEUR' | 'TRANSPORTEUR',
    data: ReviewData
  ): Promise<ReviewResponse> {
    // Vérifier que la commande existe et est terminée
    const order = await this.validateOrderForReview(data.transportOrderId, reviewerId, reviewerRole);

    // Vérifier qu'une évaluation n'existe pas déjà
    const existingReview = await prisma.review.findFirst({
      where: {
        transportOrderId: data.transportOrderId,
        reviewerType: reviewerRole
      }
    });

    if (existingReview) {
      throw new ConflictError('Une évaluation a déjà été soumise pour cette commande');
    }

    // Valider les notes (1-5)
    this.validateRatings(data);

    // Créer l'évaluation
    const review = await prisma.review.create({
      data: {
        transportOrderId: data.transportOrderId,
        transporteurId: order.transporteurId!,
        reviewerType: reviewerRole,
        overallRating: data.overallRating,
        punctualityRating: data.punctualityRating,
        communicationRating: data.communicationRating,
        vehicleConditionRating: data.vehicleConditionRating,
        professionalismRating: data.professionalismRating,
        comment: data.comment,
        pros: data.pros,
        cons: data.cons,
        isPublic: data.isPublic,
        isVerified: true // Automatiquement vérifiée car liée à une commande réelle
      }
    });

    // Mettre à jour les statistiques du transporteur
    await this.updateTransporteurRating(order.transporteurId!);

    // Marquer la commande comme évaluée
    await this.markOrderAsReviewed(data.transportOrderId, reviewerRole);

    return this.formatReviewResponse(review);
  }

  /**
   * Mettre à jour une évaluation existante
   */
  async updateReview(
    reviewId: string,
    reviewerId: string,
    data: Partial<ReviewData>
  ): Promise<ReviewResponse> {
    // Vérifier que l'évaluation existe et appartient au reviewer
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        transportOrder: {
          include: {
            expediteur: { include: { user: true } },
            transporteur: { include: { user: true } }
          }
        }
      }
    });

    if (!review) {
      throw new NotFoundError('Évaluation');
    }

    // Vérifier les permissions
    const canEdit = (review.reviewerType === 'EXPEDITEUR' && 
                     review.transportOrder.expediteur.user.id === reviewerId) ||
                    (review.reviewerType === 'TRANSPORTEUR' && 
                     review.transportOrder.transporteur?.user.id === reviewerId);

    if (!canEdit) {
      throw new AuthorizationError('Vous ne pouvez modifier que vos propres évaluations');
    }

    // Valider les nouvelles notes si fournies
    if (data.overallRating !== undefined) {
      this.validateRatings({ overallRating: data.overallRating } as ReviewData);
    }

    // Mettre à jour l'évaluation
    const updatedReview = await prisma.review.update({
      where: { id: reviewId },
      data: {
        ...(data.overallRating !== undefined && { overallRating: data.overallRating }),
        ...(data.punctualityRating !== undefined && { punctualityRating: data.punctualityRating }),
        ...(data.communicationRating !== undefined && { communicationRating: data.communicationRating }),
        ...(data.vehicleConditionRating !== undefined && { vehicleConditionRating: data.vehicleConditionRating }),
        ...(data.professionalismRating !== undefined && { professionalismRating: data.professionalismRating }),
        ...(data.comment !== undefined && { comment: data.comment }),
        ...(data.pros !== undefined && { pros: data.pros }),
        ...(data.cons !== undefined && { cons: data.cons }),
        ...(data.isPublic !== undefined && { isPublic: data.isPublic }),
        updatedAt: new Date()
      }
    });

    // Recalculer les statistiques du transporteur
    await this.updateTransporteurRating(review.transporteurId);

    return this.formatReviewResponse(updatedReview);
  }

  // ============ CONSULTATION DES ÉVALUATIONS ============

  /**
   * Récupérer les évaluations d'un transporteur
   */
  async getTransporteurReviews(
    transporteurId: string,
    filters: {
      isPublic?: boolean;
      minRating?: number;
      maxRating?: number;
      page?: number;
      limit?: number;
      sortBy?: 'date' | 'rating';
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<PaginatedResponse<ReviewResponse & { 
    orderInfo: {
      orderNumber: string;
      route: string;
      completedAt: Date;
    };
  }>> {
    const { 
      page = 1, 
      limit = 10, 
      sortBy = 'date', 
      sortOrder = 'desc',
      isPublic = true,
      ...otherFilters 
    } = filters;
    
    const skip = (page - 1) * limit;

    // Construire les conditions de filtrage
    const whereCondition: any = {
      transporteurId,
      ...(isPublic !== undefined && { isPublic }),
      ...(otherFilters.minRating && { overallRating: { gte: otherFilters.minRating } }),
      ...(otherFilters.maxRating && { overallRating: { lte: otherFilters.maxRating } })
    };

    // Définir l'ordre de tri
    const orderBy = sortBy === 'rating' 
      ? { overallRating: sortOrder }
      : { createdAt: sortOrder };

    // Récupérer les évaluations
    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy,
        include: {
          transportOrder: {
            select: {
              orderNumber: true,
              completedAt: true,
              departureAddress: {
                select: { city: true, region: true }
              },
              destinationAddress: {
                select: { city: true, region: true }
              }
            }
          }
        }
      }),
      prisma.review.count({ where: whereCondition })
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: reviews.map(review => ({
        ...this.formatReviewResponse(review),
        orderInfo: {
          orderNumber: review.transportOrder.orderNumber,
          route: `${review.transportOrder.departureAddress.city} → ${review.transportOrder.destinationAddress.city}`,
          completedAt: review.transportOrder.completedAt!
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
   * Récupérer les statistiques d'évaluation d'un transporteur
   */
  async getTransporteurRatingStats(transporteurId: string): Promise<{
    overallRating: number;
    totalReviews: number;
    ratingDistribution: { rating: number; count: number }[];
    averageRatings: {
      punctuality: number;
      communication: number;
      vehicleCondition: number;
      professionalism: number;
    };
    recentTrend: 'improving' | 'declining' | 'stable';
    recommendationRate: number;
  }> {
    // Récupérer toutes les évaluations publiques
    const reviews = await prisma.review.findMany({
      where: {
        transporteurId,
        isPublic: true
      },
      select: {
        overallRating: true,
        punctualityRating: true,
        communicationRating: true,
        vehicleConditionRating: true,
        professionalismRating: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    if (reviews.length === 0) {
      return {
        overallRating: 0,
        totalReviews: 0,
        ratingDistribution: [],
        averageRatings: {
          punctuality: 0,
          communication: 0,
          vehicleCondition: 0,
          professionalism: 0
        },
        recentTrend: 'stable',
        recommendationRate: 0
      };
    }

    // Calculer la note moyenne
    const overallRating = reviews.reduce((sum, r) => sum + r.overallRating, 0) / reviews.length;

    // Distribution des notes
    const ratingDistribution = [1, 2, 3, 4, 5].map(rating => ({
      rating,
      count: reviews.filter(r => r.overallRating === rating).length
    }));

    // Moyennes par critère
    const averageRatings = {
      punctuality: this.calculateAverage(reviews.map(r => r.punctualityRating).filter(r => r !== null)),
      communication: this.calculateAverage(reviews.map(r => r.communicationRating).filter(r => r !== null)),
      vehicleCondition: this.calculateAverage(reviews.map(r => r.vehicleConditionRating).filter(r => r !== null)),
      professionalism: this.calculateAverage(reviews.map(r => r.professionalismRating).filter(r => r !== null))
    };

    // Tendance récente (comparer les 20% les plus récents avec les précédents)
    const recentTrend = this.calculateTrend(reviews);

    // Taux de recommandation (notes 4 et 5)
    const highRatings = reviews.filter(r => r.overallRating >= 4).length;
    const recommendationRate = (highRatings / reviews.length) * 100;

    return {
      overallRating: Math.round(overallRating * 100) / 100,
      totalReviews: reviews.length,
      ratingDistribution,
      averageRatings: {
        punctuality: Math.round(averageRatings.punctuality * 100) / 100,
        communication: Math.round(averageRatings.communication * 100) / 100,
        vehicleCondition: Math.round(averageRatings.vehicleCondition * 100) / 100,
        professionalism: Math.round(averageRatings.professionalism * 100) / 100
      },
      recentTrend,
      recommendationRate: Math.round(recommendationRate * 100) / 100
    };
  }

  // ============ INTERACTION AVEC LES ÉVALUATIONS ============

  /**
   * Marquer une évaluation comme utile
   */
  async markReviewHelpful(reviewId: string, userId: string, helpful: boolean): Promise<{
    helpful: number;
    notHelpful: number;
  }> {
    // Vérifier que l'évaluation existe
    const review = await prisma.review.findUnique({
      where: { id: reviewId }
    });

    if (!review) {
      throw new NotFoundError('Évaluation');
    }

    // TODO: Implémenter un système pour éviter les votes multiples du même utilisateur
    // Pour l'instant, on incrémente directement

    const updatedReview = await prisma.review.update({
      where: { id: reviewId },
      data: {
        helpful: helpful ? review.helpful + 1 : review.helpful,
        notHelpful: helpful ? review.notHelpful : review.notHelpful + 1
      }
    });

    return {
      helpful: updatedReview.helpful,
      notHelpful: updatedReview.notHelpful
    };
  }

  /**
   * Signaler une évaluation inappropriée
   */
  async reportReview(
    reviewId: string,
    reporterId: string,
    reason: string
  ): Promise<void> {
    // Vérifier que l'évaluation existe
    const review = await prisma.review.findUnique({
      where: { id: reviewId }
    });

    if (!review) {
      throw new NotFoundError('Évaluation');
    }

    // TODO: Implémenter un système de signalement
    // Pour l'instant, on log simplement
    console.log(`Évaluation ${reviewId} signalée par ${reporterId}: ${reason}`);

    // Dans un vrai système, on pourrait:
    // 1. Créer une entrée dans une table de signalements
    // 2. Notifier les modérateurs
    // 3. Masquer temporairement l'évaluation si trop de signalements
  }

  // ============ MÉTHODES PRIVÉES ============

  /**
   * Valider qu'une commande peut être évaluée
   */
  private async validateOrderForReview(
    orderId: string,
    reviewerId: string,
    reviewerRole: 'EXPEDITEUR' | 'TRANSPORTEUR'
  ): Promise<any> {
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

    // Vérifier que la commande est terminée
    if (order.status !== TransportOrderStatus.LIVRE) {
      throw new ValidationError([{
        field: 'status',
        message: 'Seules les commandes livrées peuvent être évaluées'
      }]);
    }

    // Vérifier que l'utilisateur a participé à cette commande
    let hasAccess = false;
    if (reviewerRole === 'EXPEDITEUR') {
      hasAccess = order.expediteur.user.id === reviewerId;
    } else if (reviewerRole === 'TRANSPORTEUR') {
      hasAccess = order.transporteur?.user.id === reviewerId;
    }

    if (!hasAccess) {
      throw new AuthorizationError('Vous ne pouvez évaluer que vos propres commandes');
    }

    // Vérifier qu'un transporteur est assigné
    if (!order.transporteurId) {
      throw new ValidationError([{
        field: 'transporteur',
        message: 'Aucun transporteur assigné à évaluer'
      }]);
    }

    return order;
  }

  /**
   * Valider les notes d'évaluation
   */
  private validateRatings(data: Partial<ReviewData>): void {
    const ratings = [
      data.overallRating,
      data.punctualityRating,
      data.communicationRating,
      data.vehicleConditionRating,
      data.professionalismRating
    ].filter(rating => rating !== undefined);

    const invalidRatings = ratings.filter(rating => 
      rating !== undefined && (rating < 1 || rating > 5 || !Number.isInteger(rating))
    );

    if (invalidRatings.length > 0) {
      throw new ValidationError([{
        field: 'rating',
        message: 'Les notes doivent être des entiers entre 1 et 5'
      }]);
    }

    if (data.overallRating === undefined) {
      throw new ValidationError([{
        field: 'overallRating',
        message: 'La note globale est obligatoire'
      }]);
    }
  }

  /**
   * Mettre à jour la note moyenne du transporteur
   */
  private async updateTransporteurRating(transporteurId: string): Promise<void> {
    // Calculer la nouvelle moyenne
    const result = await prisma.review.aggregate({
      where: {
        transporteurId,
        isPublic: true
      },
      _avg: {
        overallRating: true
      },
      _count: {
        id: true
      }
    });

    const newRating = result._avg.overallRating || 0;
    const reviewCount = result._count.id;

    // Mettre à jour le transporteur
    await prisma.transporteur.update({
      where: { id: transporteurId },
      data: {
        rating: Math.round(newRating * 100) / 100
      }
    });
  }

  /**
   * Marquer une commande comme évaluée
   */
  private async markOrderAsReviewed(
    orderId: string,
    reviewerRole: 'EXPEDITEUR' | 'TRANSPORTEUR'
  ): Promise<void> {
    // TODO: Ajouter un champ dans TransportOrder pour traquer les évaluations
    // Pour l'instant, cette information est dérivée de l'existence des reviews
  }

  /**
   * Calculer la moyenne en ignorant les valeurs nulles
   */
  private calculateAverage(values: (number | null)[]): number {
    const validValues = values.filter(v => v !== null) as number[];
    if (validValues.length === 0) return 0;
    return validValues.reduce((sum, v) => sum + v, 0) / validValues.length;
  }

  /**
   * Calculer la tendance récente des évaluations
   */
  private calculateTrend(reviews: any[]): 'improving' | 'declining' | 'stable' {
    if (reviews.length < 10) return 'stable';

    const recentCount = Math.ceil(reviews.length * 0.2); // 20% les plus récents
    const recentReviews = reviews.slice(0, recentCount);
    const olderReviews = reviews.slice(recentCount, recentCount * 2);

    if (olderReviews.length === 0) return 'stable';

    const recentAvg = recentReviews.reduce((sum, r) => sum + r.overallRating, 0) / recentReviews.length;
    const olderAvg = olderReviews.reduce((sum, r) => sum + r.overallRating, 0) / olderReviews.length;

    const difference = recentAvg - olderAvg;

    if (difference > 0.3) return 'improving';
    if (difference < -0.3) return 'declining';
    return 'stable';
  }

  /**
   * Formater la réponse d'évaluation
   */
  private formatReviewResponse(review: any): ReviewResponse {
    return {
      id: review.id,
      transportOrderId: review.transportOrderId,
      transporteurId: review.transporteurId,
      reviewerType: review.reviewerType,
      overallRating: review.overallRating,
      punctualityRating: review.punctualityRating,
      communicationRating: review.communicationRating,
      vehicleConditionRating: review.vehicleConditionRating,
      professionalismRating: review.professionalismRating,
      comment: review.comment,
      pros: review.pros,
      cons: review.cons,
      isPublic: review.isPublic,
      isVerified: review.isVerified,
      helpful: review.helpful,
      notHelpful: review.notHelpful,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt
    };
  }
}

// Export de l'instance
export const reviewService = new ReviewService();