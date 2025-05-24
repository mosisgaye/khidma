import { Request, Response } from 'express';
import { authService } from '@/services/auth.service';
import { ApiResponse, HTTP_STATUS, AuthenticatedRequest } from '@/types/api.types';
import {
  registerSchema,
  loginSchema,
  emailVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  refreshTokenSchema,
  RegisterInput,
  LoginInput,
  EmailVerificationInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  RefreshTokenInput
} from '@/schemas/auth.schema';
import { asyncHandler } from '@/middleware/errorHandler';
import { redisUtils } from '@/config/redis';

// ============ CONTRÔLEUR D'AUTHENTIFICATION ============

export class AuthController {

  // ============ INSCRIPTION ============

  /**
   * Créer un nouveau compte utilisateur
   * POST /api/v1/auth/register
   */
  register = asyncHandler(async (req: Request, res: Response) => {
    // Validation des données
    const validatedData = registerSchema.parse(req.body) as RegisterInput;

    // Créer le compte
    const result = await authService.register(validatedData);

    // Réponse de succès
    const response: ApiResponse = {
      success: true,
      message: 'Compte créé avec succès. Vérifiez votre email pour activer votre compte.',
      data: {
        user: result.user,
        tokens: result.tokens,
        isFirstLogin: result.isFirstLogin
      },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.CREATED).json(response);
  });

  // ============ CONNEXION ============

  /**
   * Authentifier un utilisateur
   * POST /api/v1/auth/login
   */
  login = asyncHandler(async (req: Request, res: Response) => {
    // Validation des données
    const validatedData = loginSchema.parse(req.body) as LoginInput;

    // Ajouter les informations de la requête
    const loginData = {
      ...validatedData,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    };

    // Authentifier
    const result = await authService.login(validatedData);

    // Réponse de succès
    const response: ApiResponse = {
      success: true,
      message: result.requiresTwoFactor 
        ? 'Authentification à deux facteurs requise' 
        : 'Connexion réussie',
      data: {
        user: result.user,
        tokens: result.tokens,
        requiresTwoFactor: result.requiresTwoFactor
      },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  // ============ REFRESH TOKEN ============

  /**
   * Rafraîchir les tokens d'accès
   * POST /api/v1/auth/refresh
   */
  refreshToken = asyncHandler(async (req: Request, res: Response) => {
    // Validation
    const { refreshToken } = refreshTokenSchema.parse(req.body) as RefreshTokenInput;

    // Rafraîchir les tokens
    const tokens = await authService.refreshTokens(refreshToken);

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Tokens rafraîchis avec succès',
      data: { tokens },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  // ============ DÉCONNEXION ============

  /**
   * Déconnecter l'utilisateur courant
   * POST /api/v1/auth/logout
   */
  logout = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.userId;

    // Déconnecter
    await authService.logout(userId);

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Déconnexion réussie',
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  /**
   * Déconnecter de tous les appareils
   * POST /api/v1/auth/logout-all
   */
  logoutAll = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.userId;

    // Déconnecter de partout
    await authService.logoutAll(userId);

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Déconnecté de tous les appareils',
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  // ============ VÉRIFICATION EMAIL ============

  /**
   * Renvoyer l'email de vérification
   * POST /api/v1/auth/send-verification
   */
  sendEmailVerification = asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;

    if (!email) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Email requis',
        timestamp: new Date().toISOString()
      });
    }

    // Envoyer la vérification
    await authService.sendEmailVerification(email);

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Email de vérification envoyé',
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  /**
   * Vérifier l'email avec le token
   * POST /api/v1/auth/verify-email
   */
  verifyEmail = asyncHandler(async (req: Request, res: Response) => {
    // Validation
    const validatedData = emailVerificationSchema.parse(req.body) as EmailVerificationInput;

    // Vérifier l'email
    await authService.verifyEmail(validatedData);

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Email vérifié avec succès',
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  // ============ MOT DE PASSE ============

  /**
   * Demander la réinitialisation du mot de passe
   * POST /api/v1/auth/forgot-password
   */
  forgotPassword = asyncHandler(async (req: Request, res: Response) => {
    // Validation
    const validatedData = forgotPasswordSchema.parse(req.body) as ForgotPasswordInput;

    // Demander la réinitialisation
    await authService.forgotPassword(validatedData);

    // Réponse (toujours succès pour la sécurité)
    const response: ApiResponse = {
      success: true,
      message: 'Si un compte existe avec cet email, vous recevrez un lien de réinitialisation',
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  /**
   * Réinitialiser le mot de passe
   * POST /api/v1/auth/reset-password
   */
  resetPassword = asyncHandler(async (req: Request, res: Response) => {
    // Validation
    const validatedData = resetPasswordSchema.parse(req.body) as ResetPasswordInput;

    // Réinitialiser
    await authService.resetPassword(validatedData);

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Mot de passe réinitialisé avec succès',
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  // ============ PROFIL UTILISATEUR ============

  /**
   * Obtenir le profil de l'utilisateur connecté
   * GET /api/v1/auth/me
   */
  getProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.userId;

    // Récupérer les données utilisateur complètes
    const user = await this.getUserWithProfile(userId);

    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Utilisateur non trouvé',
        timestamp: new Date().toISOString()
      });
    }

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Profil utilisateur récupéré',
      data: { user: this.formatUserProfile(user) },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  /**
   * Vérifier si l'utilisateur est authentifié
   * GET /api/v1/auth/check
   */
  checkAuth = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Si on arrive ici, l'utilisateur est authentifié (middleware auth)
    const response: ApiResponse = {
      success: true,
      message: 'Utilisateur authentifié',
      data: {
        user: {
          id: req.user.userId,
          email: req.user.email,
          role: req.user.role,
          firstName: req.user.firstName,
          lastName: req.user.lastName
        },
        authenticated: true
      },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  // ============ STATISTIQUES ET MONITORING ============

  /**
   * Obtenir les sessions actives
   * GET /api/v1/auth/sessions
   */
  getActiveSessions = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.userId;

    // Récupérer la session courante depuis Redis
    const currentSession = await redisUtils.getUserSession(userId);

    // TODO: Implémenter la gestion multi-sessions si nécessaire
    const sessions = currentSession ? [
      {
        id: 'current',
        deviceInfo: 'Navigateur Web',
        location: 'Dakar, Sénégal', // À implémenter avec géolocalisation IP
        loginTime: currentSession.loginTime,
        lastActivity: currentSession.lastActivity || new Date(),
        isCurrent: true
      }
    ] : [];

    const response: ApiResponse = {
      success: true,
      message: 'Sessions actives récupérées',
      data: { sessions },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  /**
   * Révoquer une session spécifique
   * DELETE /api/v1/auth/sessions/:sessionId
   */
  revokeSession = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.userId;
    const { sessionId } = req.params;

    // Pour l'instant, on ne gère qu'une session par utilisateur
    if (sessionId === 'current') {
      await authService.logout(userId);
    }

    const response: ApiResponse = {
      success: true,
      message: 'Session révoquée',
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  // ============ MÉTHODES PRIVÉES ============

  /**
   * Récupérer un utilisateur avec son profil
   */
  private async getUserWithProfile(userId: string) {
    return await authService.getUserWithProfile(userId);
  }

  /**
   * Formater le profil utilisateur pour la réponse
   */
  private formatUserProfile(user: any) {
    const baseUser = {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      avatar: user.avatar,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      preferredLanguage: user.preferredLanguage,
      timezone: user.timezone,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt
    };

    // Ajouter le profil spécifique selon le rôle
    let profile = null;
    
    if (user.expediteurProfile) {
      profile = {
        type: 'EXPEDITEUR',
        companyName: user.expediteurProfile.companyName,
        companySize: user.expediteurProfile.companySize,
        businessSector: user.expediteurProfile.businessSector,
        siret: user.expediteurProfile.siret,
        website: user.expediteurProfile.website,
        verified: user.expediteurProfile.verified,
        totalOrders: user.expediteurProfile.totalOrders
      };
    } else if (user.transporteurProfile) {
      profile = {
        type: 'TRANSPORTEUR',
        companyName: user.transporteurProfile.companyName,
        licenseNumber: user.transporteurProfile.licenseNumber,
        licenseExpiryDate: user.transporteurProfile.licenseExpiryDate,
        siret: user.transporteurProfile.siret,
        fleetSize: user.transporteurProfile.fleetSize,
        verified: user.transporteurProfile.verified,
        rating: user.transporteurProfile.rating,
        totalRides: user.transporteurProfile.totalRides,
        completionRate: user.transporteurProfile.completionRate,
        isOnline: user.transporteurProfile.isOnline
      };
    } else if (user.clientProfile) {
      profile = {
        type: 'CLIENT_BOUTIQUE',
        companyName: user.clientProfile.companyName,
        customerType: user.clientProfile.customerType,
        loyaltyPoints: user.clientProfile.loyaltyPoints,
        totalSpent: user.clientProfile.totalSpent,
        preferredPayment: user.clientProfile.preferredPayment
      };
    }

    return {
      ...baseUser,
      profile
    };
  }
}

// Export de l'instance
export const authController = new AuthController();