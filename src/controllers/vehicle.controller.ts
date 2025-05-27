import { Request, Response } from 'express';
import { vehicleService } from '@/services/transport/vehicle.service';
import { ApiResponse, HTTP_STATUS, AuthenticatedRequest } from '@/types/api.types';
import {
  createVehicleSchema,
  updateVehicleSchema,
  vehicleStatusSchema,
  vehicleFiltersSchema,
  CreateVehicleInput,
  UpdateVehicleInput,
  VehicleFiltersInput
} from '@/schemas/transport.schema';
import { asyncHandler } from '@/middleware/errorHandler';
import { VehicleStatus } from '@prisma/client';

// ============ CONTRÔLEUR VÉHICULES ============

export class VehicleController {

  // ============ GESTION VÉHICULES ============

  /**
   * Créer un nouveau véhicule
   * POST /api/v1/vehicles
   */
  create = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    // Validation des données
    const validatedData = createVehicleSchema.parse(req.body) as CreateVehicleInput;

    // Récupérer l'ID du transporteur depuis l'utilisateur connecté
    const transporteurId = await this.getTransporteurId(req.user.userId);

    // Créer le véhicule
    const vehicle = await vehicleService.createVehicle(transporteurId, validatedData);

    // Réponse de succès
    const response: ApiResponse = {
      success: true,
      message: 'Véhicule créé avec succès',
      data: { vehicle },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.CREATED).json(response);
    return;
    return;
  });

  /**
   * Lister les véhicules du transporteur connecté
   * GET /api/v1/vehicles
   */
  list = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    // Validation des filtres
    const filters = vehicleFiltersSchema.parse(req.query) as VehicleFiltersInput;

    // Récupérer l'ID du transporteur
    const transporteurId = await this.getTransporteurId(req.user.userId);

    // Récupérer les véhicules
    const result = await vehicleService.getVehiclesByTransporteur(transporteurId, filters);

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Liste des véhicules récupérée',
      data: result.data,
      meta: {
        pagination: result.pagination
      },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
    return;
    return;
  });

  /**
   * Obtenir un véhicule par ID
   * GET /api/v1/vehicles/:id
   */
  getById = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;

    // Récupérer l'ID du transporteur pour vérifier la propriété
    const transporteurId = await this.getTransporteurId(req.user.userId);

    // Récupérer le véhicule
    const vehicle = await vehicleService.getVehicleById(id, transporteurId);

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Véhicule récupéré',
      data: { vehicle },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
    return;
    return;
  });

  /**
   * Mettre à jour un véhicule
   * PUT /api/v1/vehicles/:id
   */
  update = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;

    // Validation des données
    const validatedData = updateVehicleSchema.parse(req.body) as UpdateVehicleInput;

    // Récupérer l'ID du transporteur
    const transporteurId = await this.getTransporteurId(req.user.userId);

    // Mettre à jour le véhicule
    const vehicle = await vehicleService.updateVehicle(id, transporteurId, validatedData);

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Véhicule mis à jour avec succès',
      data: { vehicle },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
    return;
    return;
  });

  /**
   * Changer le statut d'un véhicule
   * PATCH /api/v1/vehicles/:id/status
   */
  updateStatus = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;

    // Validation des données
    const { status } = vehicleStatusSchema.parse(req.body);

    // Récupérer l'ID du transporteur
    const transporteurId = await this.getTransporteurId(req.user.userId);

    // Mettre à jour le statut
    const vehicle = await vehicleService.updateVehicleStatus(id, transporteurId, status);

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: `Statut du véhicule changé en ${status}`,
      data: { vehicle },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
    return;
    return;
  });

  /**
   * Supprimer un véhicule
   * DELETE /api/v1/vehicles/:id
   */
  delete = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;

    // Récupérer l'ID du transporteur
    const transporteurId = await this.getTransporteurId(req.user.userId);

    // Supprimer le véhicule
    await vehicleService.deleteVehicle(id, transporteurId);

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Véhicule supprimé avec succès',
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
    return;
    return;
  });

  // ============ MAINTENANCE ============

  /**
   * Ajouter un enregistrement de maintenance
   * POST /api/v1/vehicles/:id/maintenance
   */
  addMaintenance = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id: vehicleId } = req.params;

    // Validation des données de maintenance
    const maintenanceData = {
      type: req.body.type,
      description: req.body.description,
      cost: req.body.cost ? parseFloat(req.body.cost) : undefined,
      mileage: req.body.mileage ? parseInt(req.body.mileage) : undefined,
      performedBy: req.body.performedBy,
      performedAt: new Date(req.body.performedAt || Date.now()),
      nextDue: req.body.nextDue ? new Date(req.body.nextDue) : undefined,
      nextMileage: req.body.nextMileage ? parseInt(req.body.nextMileage) : undefined,
      documents: req.body.documents || []
    };

    // Récupérer l'ID du transporteur
    const transporteurId = await this.getTransporteurId(req.user.userId);

    // Ajouter l'enregistrement de maintenance
    const maintenanceRecord = await vehicleService.addMaintenanceRecord(
      vehicleId, 
      transporteurId, 
      maintenanceData
    );

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Enregistrement de maintenance ajouté',
      data: { maintenanceRecord },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.CREATED).json(response);
    return;
    return;
  });

  // ============ RECHERCHE PUBLIQUE ============

  /**
   * Rechercher des véhicules disponibles (pour expéditeurs)
   * GET /api/v1/vehicles/search
   */
  searchAvailable = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Validation des filtres de recherche
    const filters = {
      region: req.query.region as string,
      city: req.query.city as string,
      vehicleType: req.query.vehicleType as any,
      minCapacity: req.query.minCapacity ? parseFloat(req.query.minCapacity as string) : undefined,
      maxCapacity: req.query.maxCapacity ? parseFloat(req.query.maxCapacity as string) : undefined,
      departureDate: req.query.departureDate ? new Date(req.query.departureDate as string) : undefined,
      goodsType: req.query.goodsType as string,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10
    };

    // Rechercher les véhicules disponibles
    const result = await vehicleService.searchAvailableVehicles(filters);

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Véhicules disponibles trouvés',
      data: result.data,
      meta: {
        pagination: result.pagination
      },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
    return;
    return;
  });

  // ============ STATISTIQUES ============

  /**
   * Obtenir les statistiques des véhicules
   * GET /api/v1/vehicles/stats
   */
  getStats = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    // Récupérer l'ID du transporteur
    const transporteurId = await this.getTransporteurId(req.user.userId);

    // Récupérer les statistiques
    const stats = await vehicleService.getVehicleStats(transporteurId);

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Statistiques des véhicules récupérées',
      data: { stats },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
    return;
    return;
  });

  // ============ ACTIONS RAPIDES ============

  /**
   * Marquer un véhicule comme disponible
   * POST /api/v1/vehicles/:id/available
   */
  markAvailable = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;

    // Récupérer l'ID du transporteur
    const transporteurId = await this.getTransporteurId(req.user.userId);

    // Changer le statut
    const vehicle = await vehicleService.updateVehicleStatus(
      id, 
      transporteurId, 
      VehicleStatus.DISPONIBLE
    );

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Véhicule marqué comme disponible',
      data: { vehicle },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
    return;
    return;
  });

  /**
   * Marquer un véhicule en maintenance
   * POST /api/v1/vehicles/:id/maintenance-mode
   */
  markMaintenance = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;

    // Récupérer l'ID du transporteur
    const transporteurId = await this.getTransporteurId(req.user.userId);

    // Changer le statut
    const vehicle = await vehicleService.updateVehicleStatus(
      id, 
      transporteurId, 
      VehicleStatus.MAINTENANCE
    );

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Véhicule marqué en maintenance',
      data: { vehicle },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
    return;
    return;
  });

  // ============ MÉTHODES UTILITAIRES ============

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
      throw new AuthorizationError('Accès autorisé aux transporteurs uniquement');
    }

    return transporteur.id;
  }

  /**
   * Valider que l'utilisateur est un transporteur
   */
  private async validateTransporteurAccess(userId: string): Promise<void> {
    const { default: prisma } = await import('@/config/database');
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    if (!user || (user.role !== 'TRANSPORTEUR' && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
      const { AuthorizationError } = await import('@/middleware/errorHandler');
      throw new AuthorizationError('Accès autorisé aux transporteurs uniquement');
    }
  }

  // ============ HELPERS POUR LES IMAGES ============

  /**
   * Uploader des images pour un véhicule
   * POST /api/v1/vehicles/:id/images
   */
  uploadImages = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;

    // TODO: Implémenter l'upload d'images
    // Cette fonctionnalité nécessiterait une intégration avec un service de stockage
    // comme AWS S3, Google Cloud Storage, ou un stockage local

    const response: ApiResponse = {
      success: false,
      message: 'Upload d\'images non encore implémenté',
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.NOT_FOUND).json(response);
    return;
    return;
  });

  /**
   * Supprimer une image d'un véhicule
   * DELETE /api/v1/vehicles/:id/images/:imageId
   */
  deleteImage = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id, imageId } = req.params;

    // TODO: Implémenter la suppression d'images

    const response: ApiResponse = {
      success: false,
      message: 'Suppression d\'images non encore implémentée',
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.NOT_FOUND).json(response);
    return;
    return;
  });
}

// Export de l'instance
export const vehicleController = new VehicleController();