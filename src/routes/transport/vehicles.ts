import { Router } from 'express';
import { vehicleController } from '@/controllers/vehicle.controller';
import { authenticate, requireTransporteur } from '@/middleware/auth';
import rateLimit from 'express-rate-limit';

const router = Router();

// ============ RATE LIMITING ============

// Rate limiting pour les opérations de création/modification
const vehicleModificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 modifications par IP toutes les 15 minutes
  message: {
    success: false,
    message: 'Trop de modifications de véhicules. Réessayez dans 15 minutes.',
    error: 'RATE_LIMIT_EXCEEDED',
    timestamp: new Date().toISOString()
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting pour les recherches
const vehicleSearchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 recherches par minute
  message: {
    success: false,
    message: 'Trop de recherches. Réessayez dans une minute.',
    error: 'RATE_LIMIT_EXCEEDED',
    timestamp: new Date().toISOString()
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============ ROUTES PUBLIQUES ============

/**
 * @swagger
 * /api/v1/vehicles/search:
 *   get:
 *     summary: Rechercher des véhicules disponibles
 *     tags: [Véhicules]
 *     description: Permet aux expéditeurs de rechercher des véhicules disponibles
 *     parameters:
 *       - in: query
 *         name: region
 *         schema:
 *           type: string
 *         description: Région de recherche
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *         description: Ville de recherche
 *       - in: query
 *         name: vehicleType
 *         schema:
 *           type: string
 *           enum: [CAMION_3T, CAMION_5T, CAMION_10T, CAMION_20T, CAMION_35T, REMORQUE, SEMI_REMORQUE, FOURGON, BENNE, CITERNE]
 *         description: Type de véhicule
 *       - in: query
 *         name: minCapacity
 *         schema:
 *           type: number
 *         description: Capacité minimale (kg)
 *       - in: query
 *         name: maxCapacity
 *         schema:
 *           type: number
 *         description: Capacité maximale (kg)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Numéro de page
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Nombre d'éléments par page
 *     responses:
 *       200:
 *         description: Liste des véhicules disponibles
 *       400:
 *         description: Paramètres de recherche invalides
 */
router.get('/search', vehicleSearchLimiter, vehicleController.searchAvailable);

// ============ ROUTES PROTÉGÉES - TRANSPORTEURS UNIQUEMENT ============

/**
 * @swagger
 * /api/v1/vehicles:
 *   get:
 *     summary: Lister les véhicules du transporteur
 *     tags: [Véhicules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filtrer par type de véhicule
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filtrer par statut
 *       - in: query
 *         name: available
 *         schema:
 *           type: boolean
 *         description: Afficher seulement les véhicules disponibles
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Numéro de page
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Nombre d'éléments par page
 *     responses:
 *       200:
 *         description: Liste des véhicules du transporteur
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès refusé - transporteurs uniquement
 */
router.get('/', requireTransporteur, vehicleController.list);

/**
 * @swagger
 * /api/v1/vehicles:
 *   post:
 *     summary: Créer un nouveau véhicule
 *     tags: [Véhicules]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - brand
 *               - model
 *               - year
 *               - plateNumber
 *               - capacity
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [CAMION_3T, CAMION_5T, CAMION_10T, CAMION_20T, CAMION_35T, REMORQUE, SEMI_REMORQUE, FOURGON, BENNE, CITERNE]
 *                 example: "CAMION_10T"
 *               brand:
 *                 type: string
 *                 example: "Mercedes-Benz"
 *               model:
 *                 type: string
 *                 example: "Actros"
 *               year:
 *                 type: integer
 *                 example: 2020
 *               plateNumber:
 *                 type: string
 *                 example: "DK-1234-A"
 *               chassisNumber:
 *                 type: string
 *                 example: "WDB9632321L456789"
 *               capacity:
 *                 type: number
 *                 example: 10000
 *               volume:
 *                 type: number
 *                 example: 50
 *               fuelType:
 *                 type: string
 *                 enum: [DIESEL, ESSENCE, HYBRID, ELECTRIC]
 *                 default: "DIESEL"
 *               features:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["GPS", "Bâche", "Hayon"]
 *               insurance:
 *                 type: string
 *                 example: "ASS-2024-001"
 *               insuranceExpiry:
 *                 type: string
 *                 format: date
 *                 example: "2025-12-31"
 *               dailyRate:
 *                 type: number
 *                 example: 50000
 *               kmRate:
 *                 type: number
 *                 example: 500
 *     responses:
 *       201:
 *         description: Véhicule créé avec succès
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès refusé
 *       409:
 *         description: Plaque d'immatriculation déjà utilisée
 */
router.post('/', requireTransporteur, vehicleModificationLimiter, vehicleController.create);

/**
 * @swagger
 * /api/v1/vehicles/stats:
 *   get:
 *     summary: Obtenir les statistiques des véhicules
 *     tags: [Véhicules]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistiques des véhicules
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès refusé
 */
router.get('/stats', requireTransporteur, vehicleController.getStats);

/**
 * @swagger
 * /api/v1/vehicles/{id}:
 *   get:
 *     summary: Obtenir un véhicule par ID
 *     tags: [Véhicules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID du véhicule
 *     responses:
 *       200:
 *         description: Détails du véhicule
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès refusé
 *       404:
 *         description: Véhicule non trouvé
 */
router.get('/:id', requireTransporteur, vehicleController.getById);

/**
 * @swagger
 * /api/v1/vehicles/{id}:
 *   put:
 *     summary: Mettre à jour un véhicule
 *     tags: [Véhicules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID du véhicule
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               brand:
 *                 type: string
 *               model:
 *                 type: string
 *               year:
 *                 type: integer
 *               capacity:
 *                 type: number
 *               volume:
 *                 type: number
 *               features:
 *                 type: array
 *                 items:
 *                   type: string
 *               insurance:
 *                 type: string
 *               insuranceExpiry:
 *                 type: string
 *                 format: date
 *               dailyRate:
 *                 type: number
 *               kmRate:
 *                 type: number
 *     responses:
 *       200:
 *         description: Véhicule mis à jour avec succès
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès refusé
 *       404:
 *         description: Véhicule non trouvé
 */
router.put('/:id', requireTransporteur, vehicleModificationLimiter, vehicleController.update);

/**
 * @swagger
 * /api/v1/vehicles/{id}/status:
 *   patch:
 *     summary: Changer le statut d'un véhicule
 *     tags: [Véhicules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID du véhicule
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [DISPONIBLE, EN_COURS, MAINTENANCE, HORS_SERVICE, RESERVE]
 *                 example: "MAINTENANCE"
 *     responses:
 *       200:
 *         description: Statut mis à jour avec succès
 *       400:
 *         description: Statut invalide ou transition non autorisée
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès refusé
 *       404:
 *         description: Véhicule non trouvé
 */
router.patch('/:id/status', requireTransporteur, vehicleModificationLimiter, vehicleController.updateStatus);

/**
 * @swagger
 * /api/v1/vehicles/{id}:
 *   delete:
 *     summary: Supprimer un véhicule
 *     tags: [Véhicules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID du véhicule
 *     responses:
 *       200:
 *         description: Véhicule supprimé avec succès
 *       400:
 *         description: Impossible de supprimer (commandes actives)
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès refusé
 *       404:
 *         description: Véhicule non trouvé
 */
router.delete('/:id', requireTransporteur, vehicleModificationLimiter, vehicleController.delete);

// ============ ROUTES MAINTENANCE ============

/**
 * @swagger
 * /api/v1/vehicles/{id}/maintenance:
 *   post:
 *     summary: Ajouter un enregistrement de maintenance
 *     tags: [Véhicules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID du véhicule
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - description
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [PREVENTIVE, CORRECTIVE, ACCIDENT]
 *                 example: "PREVENTIVE"
 *               description:
 *                 type: string
 *                 example: "Vidange et changement filtres"
 *               cost:
 *                 type: number
 *                 example: 75000
 *               mileage:
 *                 type: integer
 *                 example: 150000
 *               performedBy:
 *                 type: string
 *                 example: "Garage Central Dakar"
 *               performedAt:
 *                 type: string
 *                 format: date-time
 *               nextDue:
 *                 type: string
 *                 format: date-time
 *               nextMileage:
 *                 type: integer
 *               documents:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: URLs des documents (factures, photos)
 *     responses:
 *       201:
 *         description: Maintenance enregistrée avec succès
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès refusé
 *       404:
 *         description: Véhicule non trouvé
 */
router.post('/:id/maintenance', requireTransporteur, vehicleModificationLimiter, vehicleController.addMaintenance);

// ============ ACTIONS RAPIDES ============

/**
 * @swagger
 * /api/v1/vehicles/{id}/available:
 *   post:
 *     summary: Marquer un véhicule comme disponible
 *     tags: [Véhicules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID du véhicule
 *     responses:
 *       200:
 *         description: Véhicule marqué comme disponible
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès refusé
 *       404:
 *         description: Véhicule non trouvé
 */
router.post('/:id/available', requireTransporteur, vehicleController.markAvailable);

/**
 * @swagger
 * /api/v1/vehicles/{id}/maintenance-mode:
 *   post:
 *     summary: Marquer un véhicule en maintenance
 *     tags: [Véhicules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID du véhicule
 *     responses:
 *       200:
 *         description: Véhicule marqué en maintenance
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès refusé
 *       404:
 *         description: Véhicule non trouvé
 */
router.post('/:id/maintenance-mode', requireTransporteur, vehicleController.markMaintenance);

// ============ GESTION DES IMAGES (À IMPLÉMENTER) ============

/**
 * @swagger
 * /api/v1/vehicles/{id}/images:
 *   post:
 *     summary: Uploader des images pour un véhicule
 *     tags: [Véhicules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID du véhicule
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Images uploadées avec succès
 *       400:
 *         description: Format d'image invalide
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès refusé
 *       404:
 *         description: Véhicule non trouvé
 */
router.post('/:id/images', requireTransporteur, vehicleController.uploadImages);

/**
 * @swagger
 * /api/v1/vehicles/{id}/images/{imageId}:
 *   delete:
 *     summary: Supprimer une image d'un véhicule
 *     tags: [Véhicules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID du véhicule
 *       - in: path
 *         name: imageId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de l'image
 *     responses:
 *       200:
 *         description: Image supprimée avec succès
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès refusé
 *       404:
 *         description: Véhicule ou image non trouvé
 */
router.delete('/:id/images/:imageId', requireTransporteur, vehicleController.deleteImage);

export default router;