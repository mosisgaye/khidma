import { Request, Response } from 'express';
import { transportOrderService } from '@/services/transport/order.service';
import { ApiResponse, HTTP_STATUS, AuthenticatedRequest } from '@/types/api.types';
import {
  createTransportOrderSchema,
  updateTransportOrderSchema,
  assignTransportOrderSchema,
  transportSearchSchema,
  CreateTransportOrderInput,
  UpdateTransportOrderInput,
  TransportSearchInput
} from '@/schemas/transport.schema';
import { asyncHandler } from '@/middleware/errorHandler';
import { TransportOrderStatus } from '@prisma/client';

// ============ CONTRÔLEUR COMMANDES TRANSPORT ============

export class TransportOrderController {

  // ============ GESTION DES COMMANDES ============

  /**
   * Créer une nouvelle commande de transport
   * POST /api/v1/orders
   */
  create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Validation des données
    const validatedData = createTransportOrderSchema.parse(req.body) as CreateTransportOrderInput;

    // Récupérer l'ID de l'expéditeur depuis l'utilisateur connecté
    const expediteurId = await this.getExpediteurId(req.user.userId);

    // Créer la commande
    const order = await transportOrderService.createOrder(expediteurId, validatedData);

    // Réponse de succès
    const response: ApiResponse = {
      success: true,
      message: 'Commande de transport créée avec succès',
      data: { order },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.CREATED).json(response);
  });

  /**
   * Lister les commandes de l'utilisateur connecté
   * GET /api/v1/orders
   */
  list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Paramètres de filtrage et pagination
    const filters = {
      status: req.query.status ? 
        (Array.isArray(req.query.status) ? req.query.status : [req.query.status]) as TransportOrderStatus[] : 
        undefined,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      sortBy: req.query.sortBy as 'date' | 'price' | 'status' || 'date',
      sortOrder: req.query.sortOrder as 'asc' | 'desc' || 'desc'
    };

    // Récupérer les commandes selon le rôle
    const result = await transportOrderService.getOrdersByUser(
      req.user.userId,
      req.user.role,
      filters
    );

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Liste des commandes récupérée',
      data: result.data,
      meta: {
        pagination: result.pagination
      },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  /**
   * Obtenir une commande par ID
   * GET /api/v1/orders/:id
   */
  getById = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    // Récupérer la commande avec vérification d'accès
    const order = await transportOrderService.getOrderById(id, req.user.userId);

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Commande récupérée',
      data: { order },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  /**
   * Mettre à jour une commande
   * PUT /api/v1/orders/:id
   */
  update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    // Validation des données
    const validatedData = updateTransportOrderSchema.parse(req.body) as UpdateTransportOrderInput;

    // TODO: Implémenter la mise à jour des commandes
    // Cette fonctionnalité nécessite des règles métier spécifiques

    const response: ApiResponse = {
      success: false,
      message: 'Mise à jour des commandes non encore implémentée',
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.NOT_FOUND).json(response);
  });

  // ============ RECHERCHE PUBLIQUE ============

  /**
   * Rechercher des commandes avec filtres avancés
   * POST /api/v1/orders/search
   */
  search = asyncHandler(async (req: Request, res: Response) => {
    // Validation des filtres de recherche
    const filters = transportSearchSchema.parse(req.body) as TransportSearchInput;

    // Rechercher les commandes
    const result = await transportOrderService.searchOrders(filters);

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Commandes trouvées',
      data: result.data,
      meta: {
        pagination: result.pagination,
        filters: {
          applied: Object.keys(req.body).length,
          total: result.pagination.total
        }
      },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  // ============ WORKFLOW DES COMMANDES ============

  /**
   * Assigner une commande à un transporteur
   * POST /api/v1/orders/:id/assign
   */
  assign = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    // Validation des données d'assignation
    const validatedData = assignTransportOrderSchema.parse(req.body);

    // Récupérer l'ID du transporteur
    const transporteurId = await this.getTransporteurId(req.user.userId);

    // Assigner la commande
    const order = await transportOrderService.assignOrder(
      id,
      transporteurId,
      validatedData.vehicleId,
      validatedData.estimatedDelivery
    );

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Commande assignée avec succès',
      data: { order },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  /**
   * Démarrer une commande (passage en transit)
   * POST /api/v1/orders/:id/start
   */
  start = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    // Récupérer l'ID du transporteur
    const transporteurId = await this.getTransporteurId(req.user.userId);

    // Démarrer la commande
    const order = await transportOrderService.startOrder(id, transporteurId);

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Commande démarrée - Transport en cours',
      data: { order },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  /**
   * Terminer une commande (livraison)
   * POST /api/v1/orders/:id/complete
   */
  complete = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    // Données de complétion
    const completionData = {
      deliveryProof: req.body.deliveryProof || [],
      signature: req.body.signature,
      notes: req.body.notes
    };

    // Récupérer l'ID du transporteur
    const transporteurId = await this.getTransporteurId(req.user.userId);

    // Terminer la commande
    const order = await transportOrderService.completeOrder(id, transporteurId, completionData);

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Commande terminée avec succès - Livraison effectuée',
      data: { order },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  /**
   * Annuler une commande
   * POST /api/v1/orders/:id/cancel
   */
  cancel = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
      const response: ApiResponse = {
        success: false,
        message: 'Raison d\'annulation requise (minimum 10 caractères)',
        timestamp: new Date().toISOString()
      };
      return res.status(HTTP_STATUS.BAD_REQUEST).json(response);
    }

    // Annuler la commande
    const order = await transportOrderService.cancelOrder(id, req.user.userId, reason.trim());

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Commande annulée',
      data: { order },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  // ============ STATISTIQUES ET TABLEAUX DE BORD ============

  /**
   * Obtenir les statistiques des commandes de l'utilisateur
   * GET /api/v1/orders/stats
   */
  getStats = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    let userId: string;
    let userType: string;

    // Déterminer le type d'utilisateur et récupérer l'ID approprié
    if (req.user.role === 'EXPEDITEUR') {
      userId = await this.getExpediteurId(req.user.userId);
      userType = 'expediteur';
    } else if (req.user.role === 'TRANSPORTEUR') {
      userId = await this.getTransporteurId(req.user.userId);
      userType = 'transporteur';
    } else {
      const response: ApiResponse = {
        success: false,
        message: 'Statistiques disponibles pour les expéditeurs et transporteurs uniquement',
        timestamp: new Date().toISOString()
      };
      return res.status(HTTP_STATUS.FORBIDDEN).json(response);
    }

    // Récupérer les statistiques
    const stats = await this.calculateUserStats(userId, userType);

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Statistiques récupérées',
      data: { stats },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  /**
   * Obtenir le tableau de bord de l'utilisateur
   * GET /api/v1/orders/dashboard
   */
  getDashboard = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Récupérer les commandes récentes
    const recentOrders = await transportOrderService.getOrdersByUser(
      req.user.userId,
      req.user.role,
      { page: 1, limit: 5, sortBy: 'date', sortOrder: 'desc' }
    );

    // Récupérer les statistiques
    let userId: string;
    let userType: string;

    if (req.user.role === 'EXPEDITEUR') {
      userId = await this.getExpediteurId(req.user.userId);
      userType = 'expediteur';
    } else if (req.user.role === 'TRANSPORTEUR') {
      userId = await this.getTransporteurId(req.user.userId);
      userType = 'transporteur';
    } else {
      const response: ApiResponse = {
        success: false,
        message: 'Tableau de bord disponible pour les expéditeurs et transporteurs uniquement',
        timestamp: new Date().toISOString()
      };
      return res.status(HTTP_STATUS.FORBIDDEN).json(response);
    }

    const stats = await this.calculateUserStats(userId, userType);

    // Construire le tableau de bord
    const dashboard = {
      user: {
        name: `${req.user.firstName} ${req.user.lastName}`,
        role: req.user.role
      },
      summary: stats,
      recentOrders: recentOrders.data.slice(0, 5),
      quickActions: this.getQuickActions(req.user.role),
      notifications: [], // TODO: Implémenter les notifications
      tips: this.getUserTips(req.user.role)
    };

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Tableau de bord récupéré',
      data: { dashboard },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  // ============ MÉTHODES UTILITAIRES ============

  /**
   * Récupérer l'ID de l'expéditeur depuis l'utilisateur connecté
   */
  private async getExpediteurId(userId: string): Promise<string> {
    const { default: prisma } = await import('@/config/database');
    
    const expediteur = await prisma.expediteur.findUnique({
      where: { userId },
      select: { id: true }
    });

    if (!expediteur) {
      const { AuthorizationError } = await import('@/middleware/errorHandler');
      throw new AuthorizationError('Profil expéditeur requis');
    }

    return expediteur.id;
  }

  /**
   * Récupérer l'ID du transporteur depuis l'utilisateur connecté
   */
  private async getTransporteurId(userId: string): Promise<string> {
    const { default: prisma } = await import('@/config/database');
    
    const transporteur = await prisma.transporteur.findUnique({
      where: { userId },
      select: { id: true }
    });

    if (!transporteur) {
      const { AuthorizationError } = await import('@/middleware/errorHandler');
      throw new AuthorizationError('Profil transporteur requis');
    }

    return transporteur.id;
  }

  /**
   * Calculer les statistiques utilisateur
   */
  private async calculateUserStats(userId: string, userType: string): Promise<any> {
    const { default: prisma } = await import('@/config/database');

    const whereCondition = userType === 'expediteur' 
      ? { expediteurId: userId }
      : { transporteurId: userId };

    // Statistiques par statut
    const statusStats = await prisma.transportOrder.groupBy({
      by: ['status'],
      where: whereCondition,
      _count: { id: true }
    });

    // Statistiques financières
    const financialStats = await prisma.transportOrder.aggregate({
      where: {
        ...whereCondition,
        status: { in: [TransportOrderStatus.LIVRE, TransportOrderStatus.TERMINE] }
      },
      _sum: { totalPrice: true },
      _avg: { totalPrice: true },
      _count: { id: true }
    });

    // Commandes du mois en cours
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const monthlyOrders = await prisma.transportOrder.count({
      where: {
        ...whereCondition,
        createdAt: { gte: startOfMonth }
      }
    });

    return {
      total: statusStats.reduce((sum, stat) => sum + stat._count.id, 0),
      byStatus: statusStats.reduce((acc, stat) => {
        acc[stat.status] = stat._count.id;
        return acc;
      }, {} as Record<string, number>),
      thisMonth: monthlyOrders,
      revenue: financialStats._sum.totalPrice || 0,
      averageValue: financialStats._avg.totalPrice || 0,
      completedOrders: financialStats._count || 0
    };
  }

  /**
   * Obtenir les actions rapides selon le rôle
   */
  private getQuickActions(role: string): any[] {
    if (role === 'EXPEDITEUR') {
      return [
        {
          title: 'Nouvelle commande',
          description: 'Créer une demande de transport',
          action: 'CREATE_ORDER',
          icon: 'plus'
        },
        {
          title: 'Mes adresses',
          description: 'Gérer mes adresses de livraison',
          action: 'MANAGE_ADDRESSES',
          icon: 'location'
        },
        {
          title: 'Rechercher transporteurs',
          description: 'Trouver des transporteurs disponibles',
          action: 'SEARCH_TRANSPORTERS',
          icon: 'search'
        }
      ];
    } else if (role === 'TRANSPORTEUR') {
      return [
        {
          title: 'Mes véhicules',
          description: 'Gérer ma flotte de véhicules',
          action: 'MANAGE_VEHICLES',
          icon: 'truck'
        },
        {
          title: 'Commandes disponibles',
          description: 'Voir les nouvelles opportunités',
          action: 'BROWSE_ORDERS',
          icon: 'list'
        },
        {
          title: 'Mes disponibilités',
          description: 'Gérer mon planning',
          action: 'MANAGE_AVAILABILITY',
          icon: 'calendar'
        }
      ];
    }

    return [];
  }

  /**
   * Obtenir des conseils selon le rôle
   */
  private getUserTips(role: string): string[] {
    if (role === 'EXPEDITEUR') {
      return [
        'Ajoutez des photos de vos marchandises pour faciliter l\'évaluation',
        'Préparez vos documents à l\'avance pour un enlèvement plus rapide',
        'Communiquez clairement les exigences spéciales (fragile, urgent, etc.)'
      ];
    } else if (role === 'TRANSPORTEUR') {
      return [
        'Maintenez vos véhicules à jour pour avoir plus d\'opportunités',
        'Répondez rapidement aux demandes pour améliorer votre réputation',
        'Tenez votre planning à jour pour optimiser vos trajets'
      ];
    }

    return [];
  }
}

// Export de l'instance
export const transportOrderController = new TransportOrderController();