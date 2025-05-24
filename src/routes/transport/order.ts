import { Router } from 'express';
import { transportOrderController } from '@/controllers/transport/order.controller';
import { authenticate, requireExpediteur, requireTransporteur } from '@/middleware/auth';
import rateLimit from 'express-rate-limit';

const router = Router();

// ============ RATE LIMITING ============

// Rate limiting pour la création de commandes
const orderCreationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 commandes par IP toutes les 15 minutes
  message: {
    success: false,
    message: 'Trop de créations de commandes. Réessayez dans 15 minutes.',
    error: 'RATE_LIMIT_EXCEEDED',
    timestamp: new Date().toISOString()
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting pour les recherches
const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 50, // 50 recherches par minute
  message: {
    success: false,
    message: 'Trop de recherches. Réessayez dans une minute.',
    error: 'RATE_LIMIT_EXCEEDED',
    timestamp: new Date().toISOString()
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting pour les actions de workflow
const workflowLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 actions par 5 minutes
  message: {
    success: false,
    message: 'Trop d\'actions sur les commandes. Réessayez dans 5 minutes.',
    error: 'RATE_LIMIT_EXCEEDED',
    timestamp: new Date().toISOString()
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============ ROUTES PUBLIQUES ============

/**
 * @swagger
 * /api/v1/orders/search:
 *   post:
 *     summary: Rechercher des commandes de transport
 *     tags: [Commandes Transport]
 *     description: Permet aux transporteurs de rechercher des commandes disponibles
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               departureRegion:
 *                 type: string
 *                 example: "Dakar"
 *               departureCity:
 *                 type: string
 *                 example: "Dakar"
 *               destinationRegion:
 *                 type: string
 *                 example: "Thiès"
 *               destinationCity:
 *                 type: string
 *                 example: "Thiès"
 *               goodsType:
 *                 type: string
 *                 enum: [MATERIAUX_CONSTRUCTION, PRODUITS_ALIMENTAIRES, MARCHANDISES_GENERALES, VEHICULES, PRODUITS_CHIMIQUES, LIQUIDES, CEREALES, BETAIL, EQUIPEMENTS, MOBILIER, TEXTILES, PRODUITS_DANGEREUX]
 *                 example: "MATERIAUX_CONSTRUCTION"
 *               minWeight:
 *                 type: number
 *                 example: 1000
 *               maxWeight:
 *                 type: number
 *                 example: 10000
 *               vehicleType:
 *                 type: string
 *                 enum: [CAMION_3T, CAMION_5T, CAMION_10T, CAMION_20T, CAMION_35T, REMORQUE, SEMI_REMORQUE, FOURGON, BENNE, CITERNE]
 *                 example: "CAMION_10T"
 *               departureDateFrom:
 *                 type: string
 *                 format: date
 *                 example: "2025-05-25"
 *               departureDateTo:
 *                 type: string
 *                 format: date
 *                 example: "2025-05-30"
 *               maxPrice:
 *                 type: number
 *                 example: 100000
 *               sortBy:
 *                 type: string
 *                 enum: [date, price, distance, rating]
 *                 default: "date"
 *               sortOrder:
 *                 type: string
 *                 enum: [asc, desc]
 *                 default: "desc"
 *               page:
 *                 type: integer
 *                 default: 1
 *               limit:
 *                 type: integer
 *                 default: 10
 *     responses:
 *       200:
 *         description: Liste des commandes trouvées
 *       400:
 *         description: Critères de recherche invalides
 */
router.post('/search', searchLimiter, transportOrderController.search);

// ============ ROUTES PROTÉGÉES ============

/**
 * @swagger
 * /api/v1/orders:
 *   get:
 *     summary: Lister les commandes de l'utilisateur connecté
 *     tags: [Commandes Transport]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *             enum: [DEMANDE, DEVIS_ENVOYE, DEVIS_ACCEPTE, DEVIS_REFUSE, CONFIRME, EN_PREPARATION, EN_TRANSIT, LIVRE, TERMINE, ANNULE, LITIGE, REMBOURSE]
 *         description: Filtrer par statut (peut être multiple)
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [date, price, status]
 *           default: "date"
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: "desc"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Liste des commandes de l'utilisateur
 *       401:
 *         description: Non authentifié
 */
router.get('/', authenticate(), transportOrderController.list);

/**
 * @swagger
 * /api/v1/orders:
 *   post:
 *     summary: Créer une nouvelle commande de transport
 *     tags: [Commandes Transport]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - departureAddressId
 *               - destinationAddressId
 *               - departureDate
 *               - goodsType
 *               - goodsDescription
 *               - weight
 *             properties:
 *               departureAddressId:
 *                 type: string
 *                 example: "clxxx123456789"
 *               destinationAddressId:
 *                 type: string
 *                 example: "clxxx987654321"
 *               departureDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-05-25T08:00:00Z"
 *               departureTime:
 *                 type: string
 *                 example: "08:00"
 *               deliveryDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-05-25T18:00:00Z"
 *               deliveryTime:
 *                 type: string
 *                 example: "18:00"
 *               goodsType:
 *                 type: string
 *                 enum: [MATERIAUX_CONSTRUCTION, PRODUITS_ALIMENTAIRES, MARCHANDISES_GENERALES, VEHICULES, PRODUITS_CHIMIQUES, LIQUIDES, CEREALES, BETAIL, EQUIPEMENTS, MOBILIER, TEXTILES, PRODUITS_DANGEREUX]
 *                 example: "MATERIAUX_CONSTRUCTION"
 *               goodsDescription:
 *                 type: string
 *                 example: "Sacs de ciment Portland 50kg, palettisés"
 *               weight:
 *                 type: number
 *                 example: 5000
 *               volume:
 *                 type: number
 *                 example: 25
 *               quantity:
 *                 type: integer
 *                 example: 100
 *               packagingType:
 *                 type: string
 *                 example: "Palettes"
 *               specialRequirements:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Urgent", "Fragile"]
 *               declaredValue:
 *                 type: number
 *                 example: 500000
 *               priority:
 *                 type: string
 *                 enum: [LOW, NORMAL, HIGH, URGENT]
 *                 default: "NORMAL"
 *               notes:
 *                 type: string
 *                 example: "Livraison sur chantier, accès difficile"
 *               departureContact:
 *                 type: string
 *                 example: "Mamadou Diallo - +221771234567"
 *               destinationContact:
 *                 type: string
 *                 example: "Aïcha Ndiaye - +221781234567"
 *               departureInstructions:
 *                 type: string
 *                 example: "Sonner à l'entrée principale"
 *               deliveryInstructions:
 *                 type: string
 *                 example: "Livraison sur le chantier, zone de stockage à droite"
 *     responses:
 *       201:
 *         description: Commande créée avec succès
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès refusé - expéditeurs uniquement
 */
router.post('/', requireExpediteur, orderCreationLimiter, transportOrderController.create);

/**
 * @swagger
 * /api/v1/orders/stats:
 *   get:
 *     summary: Obtenir les statistiques des commandes
 *     tags: [Commandes Transport]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistiques des commandes
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès refusé
 */
router.get('/stats', authenticate(), transportOrderController.getStats);

/**
 * @swagger
 * /api/v1/orders/dashboard:
 *   get:
 *     summary: Obtenir le tableau de bord de l'utilisateur
 *     tags: [Commandes Transport]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tableau de bord avec résumé et actions rapides
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès refusé
 */
router.get('/dashboard', authenticate(), transportOrderController.getDashboard);

/**
 * @swagger
 * /api/v1/orders/{id}:
 *   get:
 *     summary: Obtenir une commande par ID
 *     tags: [Commandes Transport]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la commande
 *     responses:
 *       200:
 *         description: Détails de la commande
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès refusé
 *       404:
 *         description: Commande non trouvée
 */
router.get('/:id', authenticate(), transportOrderController.getById);

/**
 * @swagger
 * /api/v1/orders/{id}:
 *   put:
 *     summary: Mettre à jour une commande
 *     tags: [Commandes Transport]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la commande
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               goodsDescription:
 *                 type: string
 *               weight:
 *                 type: number
 *               volume:
 *                 type: number
 *               specialRequirements:
 *                 type: array
 *                 items:
 *                   type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Commande mise à jour avec succès
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès refusé
 *       404:
 *         description: Commande non trouvée
 */
router.put('/:id', authenticate(), transportOrderController.update);

// ============ WORKFLOW DES COMMANDES ============

/**
 * @swagger
 * /api/v1/orders/{id}/assign:
 *   post:
 *     summary: Assigner une commande à un transporteur
 *     tags: [Commandes Transport]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la commande
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - vehicleId
 *             properties:
 *               vehicleId:
 *                 type: string
 *                 example: "clxxx456789123"
 *               estimatedDelivery:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-05-25T18:00:00Z"
 *     responses:
 *       200:
 *         description: Commande assignée avec succès
 *       400:
 *         description: Assignation impossible (véhicule indisponible, capacité insuffisante)
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès refusé - transporteurs uniquement
 *       404:
 *         description: Commande ou véhicule non trouvé
 */
router.post('/:id/assign', requireTransporteur, workflowLimiter, transportOrderController.assign);

/**
 * @swagger
 * /api/v1/orders/{id}/start:
 *   post:
 *     summary: Démarrer une commande (passage en transit)
 *     tags: [Commandes Transport]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la commande
 *     responses:
 *       200:
 *         description: Commande démarrée - Transport en cours
 *       400:
 *         description: Commande ne peut pas être démarrée
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès refusé - transporteurs uniquement
 *       404:
 *         description: Commande non trouvée
 */
router.post('/:id/start', requireTransporteur, workflowLimiter, transportOrderController.start);

/**
 * @swagger
 * /api/v1/orders/{id}/complete:
 *   post:
 *     summary: Terminer une commande (livraison effectuée)
 *     tags: [Commandes Transport]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la commande
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               deliveryProof:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: URLs des photos de preuve de livraison
 *                 example: ["https://example.com/proof1.jpg", "https://example.com/proof2.jpg"]
 *               signature:
 *                 type: string
 *                 description: Signature électronique du destinataire (base64)
 *               notes:
 *                 type: string
 *                 description: Notes sur la livraison
 *                 example: "Livraison effectuée sans problème"
 *     responses:
 *       200:
 *         description: Commande terminée avec succès - Livraison effectuée
 *       400:
 *         description: Commande ne peut pas être terminée
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès refusé - transporteurs uniquement
 *       404:
 *         description: Commande non trouvée
 */
router.post('/:id/complete', requireTransporteur, workflowLimiter, transportOrderController.complete);

/**
 * @swagger
 * /api/v1/orders/{id}/cancel:
 *   post:
 *     summary: Annuler une commande
 *     tags: [Commandes Transport]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la commande
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 minLength: 10
 *                 example: "Changement de planning, livraison reportée"
 *     responses:
 *       200:
 *         description: Commande annulée
 *       400:
 *         description: Raison d'annulation requise ou commande ne peut pas être annulée
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès refusé
 *       404:
 *         description: Commande non trouvée
 */
router.post('/:id/cancel', authenticate(), workflowLimiter, transportOrderController.cancel);

export default router;