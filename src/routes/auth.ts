import { Router } from 'express';
import { authController } from '@/controllers/auth.controller';
import { authenticate } from '@/middleware/auth';
import rateLimit from 'express-rate-limit';

const router = Router();

// ============ RATE LIMITING ============

// Rate limiting pour les endpoints sensibles
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 tentatives par IP
  message: {
    success: false,
    message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.',
    error: 'RATE_LIMIT_EXCEEDED',
    timestamp: new Date().toISOString()
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting plus permissif pour la vérification
const verificationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // 3 tentatives par IP
  message: {
    success: false,
    message: 'Trop de demandes de vérification. Réessayez dans 5 minutes.',
    error: 'RATE_LIMIT_EXCEEDED',
    timestamp: new Date().toISOString()
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting pour les requêtes générales
const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 requêtes par minute
  message: {
    success: false,
    message: 'Trop de requêtes. Réessayez dans une minute.',
    error: 'RATE_LIMIT_EXCEEDED',
    timestamp: new Date().toISOString()
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============ ROUTES PUBLIQUES ============

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     summary: Créer un nouveau compte utilisateur
 *     tags: [Authentification]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - confirmPassword
 *               - firstName
 *               - lastName
 *               - role
 *               - acceptTerms
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: "MotDePasse123!"
 *               confirmPassword:
 *                 type: string
 *                 example: "MotDePasse123!"
 *               firstName:
 *                 type: string
 *                 example: "Mamadou"
 *               lastName:
 *                 type: string
 *                 example: "Diallo"
 *               phone:
 *                 type: string
 *                 example: "+221771234567"
 *               role:
 *                 type: string
 *                 enum: [EXPEDITEUR, TRANSPORTEUR, CLIENT_BOUTIQUE]
 *                 example: "TRANSPORTEUR"
 *               acceptTerms:
 *                 type: boolean
 *                 example: true
 *               companyName:
 *                 type: string
 *                 example: "Transport Diallo SARL"
 *               licenseNumber:
 *                 type: string
 *                 example: "TR-2024-001"
 *     responses:
 *       201:
 *         description: Compte créé avec succès
 *       400:
 *         description: Erreur de validation
 *       409:
 *         description: Email ou téléphone déjà utilisé
 */
router.post('/register', authLimiter, authController.register);

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Authentifier un utilisateur
 *     tags: [Authentification]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *               password:
 *                 type: string
 *                 example: "MotDePasse123!"
 *               rememberMe:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Connexion réussie
 *       401:
 *         description: Identifiants invalides
 *       423:
 *         description: Compte verrouillé
 */
router.post('/login', authLimiter, authController.login);

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Rafraîchir les tokens d'accès
 *     tags: [Authentification]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: Tokens rafraîchis avec succès
 *       401:
 *         description: Refresh token invalide
 */
router.post('/refresh', generalLimiter, authController.refreshToken);

/**
 * @swagger
 * /api/v1/auth/forgot-password:
 *   post:
 *     summary: Demander la réinitialisation du mot de passe
 *     tags: [Authentification]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *     responses:
 *       200:
 *         description: Email de réinitialisation envoyé (si le compte existe)
 */
router.post('/forgot-password', verificationLimiter, authController.forgotPassword);

/**
 * @swagger
 * /api/v1/auth/reset-password:
 *   post:
 *     summary: Réinitialiser le mot de passe
 *     tags: [Authentification]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - password
 *               - confirmPassword
 *             properties:
 *               token:
 *                 type: string
 *                 example: "abc123def456..."
 *               password:
 *                 type: string
 *                 example: "NouveauMotDePasse123!"
 *               confirmPassword:
 *                 type: string
 *                 example: "NouveauMotDePasse123!"
 *     responses:
 *       200:
 *         description: Mot de passe réinitialisé avec succès
 *       400:
 *         description: Token invalide ou expiré
 */
router.post('/reset-password', authLimiter, authController.resetPassword);

/**
 * @swagger
 * /api/v1/auth/send-verification:
 *   post:
 *     summary: Renvoyer l'email de vérification
 *     tags: [Authentification]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *     responses:
 *       200:
 *         description: Email de vérification envoyé
 */
router.post('/send-verification', verificationLimiter, authController.sendEmailVerification);

/**
 * @swagger
 * /api/v1/auth/verify-email:
 *   post:
 *     summary: Vérifier l'email avec le token
 *     tags: [Authentification]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - token
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *               token:
 *                 type: string
 *                 example: "abc123def456..."
 *     responses:
 *       200:
 *         description: Email vérifié avec succès
 *       400:
 *         description: Token invalide ou expiré
 */
router.post('/verify-email', authController.verifyEmail);

// ============ ROUTES PROTÉGÉES ============

/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     summary: Obtenir le profil de l'utilisateur connecté
 *     tags: [Authentification]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profil utilisateur récupéré
 *       401:
 *         description: Token invalide
 */
router.get('/me', authenticate(), authController.getProfile);

/**
 * @swagger
 * /api/v1/auth/check:
 *   get:
 *     summary: Vérifier si l'utilisateur est authentifié
 *     tags: [Authentification]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Utilisateur authentifié
 *       401:
 *         description: Non authentifié
 */
router.get('/check', authenticate(), authController.checkAuth);

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: Déconnecter l'utilisateur courant
 *     tags: [Authentification]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Déconnexion réussie
 *       401:
 *         description: Non authentifié
 */
router.post('/logout', authenticate(), authController.logout);

/**
 * @swagger
 * /api/v1/auth/logout-all:
 *   post:
 *     summary: Déconnecter de tous les appareils
 *     tags: [Authentification]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Déconnecté de tous les appareils
 *       401:
 *         description: Non authentifié
 */
router.post('/logout-all', authenticate(), authController.logoutAll);

/**
 * @swagger
 * /api/v1/auth/sessions:
 *   get:
 *     summary: Obtenir les sessions actives
 *     tags: [Authentification]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sessions actives récupérées
 *       401:
 *         description: Non authentifié
 */
router.get('/sessions', authenticate(), authController.getActiveSessions);

/**
 * @swagger
 * /api/v1/auth/sessions/{sessionId}:
 *   delete:
 *     summary: Révoquer une session spécifique
 *     tags: [Authentification]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la session à révoquer
 *     responses:
 *       200:
 *         description: Session révoquée
 *       401:
 *         description: Non authentifié
 *       404:
 *         description: Session non trouvée
 */
router.delete('/sessions/:sessionId', authenticate(), authController.revokeSession);

export default router;