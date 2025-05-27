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
import prisma from '@/config/database'; // Import statique

// ============ CONTRÔLEUR D'AUTHENTIFICATION ============

export class AuthController {

  // ============ INSCRIPTION ============

  /**
   * Créer un nouveau compte utilisateur
   * POST /api/v1/auth/register
   */
  register = asyncHandler(async (req: Request, res: Response) => {
    // Validation des données avec nettoyage
    const cleanedData = {
      ...req.body,
      email: String(req.body.email || '').toLowerCase().trim(),
      firstName: String(req.body.firstName || '').trim(),
      lastName: String(req.body.lastName || '').trim(),
      phone: req.body.phone ? String(req.body.phone).trim() : undefined,
      companyName: req.body.companyName ? String(req.body.companyName).trim() : undefined
    };

    const validatedData = registerSchema.parse(cleanedData) as RegisterInput;

    // Créer le compte
    const result = await authService.register(validatedData);

    // Réponse de succès avec informations sécurisées
    const response: ApiResponse = {
      success: true,
      message: 'Compte créé avec succès. Vérifiez votre email pour activer votre compte.',
      data: {
        user: result.user,
        tokens: result.tokens,
        isFirstLogin: result.isFirstLogin,
        registration: {
          role: validatedData.role,
          needsVerification: !result.user.emailVerified,
          registeredAt: new Date().toISOString()
        }
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
    // Validation et nettoyage des données
    const cleanedData = {
      email: String(req.body.email || '').toLowerCase().trim(),
      password: String(req.body.password || ''),
      rememberMe: Boolean(req.body.rememberMe)
    };

    const validatedData = loginSchema.parse(cleanedData) as LoginInput;

    // Ajouter les informations de la requête pour la sécurité
    const loginDataWithMeta = {
      ...validatedData,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    };

    // Authentifier
    const result = await authService.login(validatedData);

    // Réponse de succès avec métadonnées
    const response: ApiResponse = {
      success: true,
      message: result.requiresTwoFactor 
        ? 'Authentification à deux facteurs requise' 
        : 'Connexion réussie',
      data: {
        user: result.user,
        tokens: result.tokens,
        requiresTwoFactor: result.requiresTwoFactor,
        session: {
          loginTime: new Date().toISOString(),
          ipAddress: req.ip,
          rememberMe: cleanedData.rememberMe
        }
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
    // Validation avec nettoyage
    const { refreshToken } = refreshTokenSchema.parse({
      refreshToken: String(req.body.refreshToken || '').trim()
    }) as RefreshTokenInput;

    if (!refreshToken) {
      const response: ApiResponse = {
        success: false,
        message: 'Refresh token requis',
        error: 'MISSING_REFRESH_TOKEN',
        timestamp: new Date().toISOString()
      };
      return res.status(HTTP_STATUS.BAD_REQUEST).json(response);
    }

    // Rafraîchir les tokens
    const tokens = await authService.refreshTokens(refreshToken);

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Tokens rafraîchis avec succès',
      data: { 
        tokens,
        refreshedAt: new Date().toISOString()
      },
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

    // Déconnecter avec gestion d'erreur
    try {
      await authService.logout(userId);
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
      // Continuer même en cas d'erreur pour permettre la déconnexion côté client
    }

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Déconnexion réussie',
      data: {
        logoutTime: new Date().toISOString(),
        userId
      },
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

    // Déconnecter de partout avec gestion d'erreur
    try {
      await authService.logoutAll(userId);
    } catch (error) {
      console.error('Erreur lors de la déconnexion globale:', error);
    }

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Déconnecté de tous les appareils',
      data: {
        globalLogoutTime: new Date().toISOString(),
        userId
      },
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
    const email = String(req.body.email || '').toLowerCase().trim();

    if (!email) {
      const response: ApiResponse = {
        success: false,
        message: 'Email requis',
        error: 'MISSING_EMAIL',
        timestamp: new Date().toISOString()
      };
      return res.status(HTTP_STATUS.BAD_REQUEST).json(response);
    }

    // Validation du format email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      const response: ApiResponse = {
        success: false,
        message: 'Format email invalide',
        error: 'INVALID_EMAIL_FORMAT',
        timestamp: new Date().toISOString()
      };
      return res.status(HTTP_STATUS.BAD_REQUEST).json(response);
    }

    // Envoyer la vérification
    try {
      await authService.sendEmailVerification(email);
    } catch (error) {
      // Ne pas révéler si l'email existe ou non pour la sécurité
      console.error('Erreur envoi vérification email:', error);
    }

    // Réponse toujours positive pour la sécurité
    const response: ApiResponse = {
      success: true,
      message: 'Si un compte existe avec cet email, un email de vérification a été envoyé',
      data: {
        email,
        sentAt: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  /**
   * Vérifier l'email avec le token
   * POST /api/v1/auth/verify-email
   */
  verifyEmail = asyncHandler(async (req: Request, res: Response) => {
    // Validation et nettoyage
    const cleanedData = {
      email: String(req.body.email || '').toLowerCase().trim(),
      token: String(req.body.token || '').trim()
    };

    const validatedData = emailVerificationSchema.parse(cleanedData) as EmailVerificationInput;

    // Vérifier l'email
    await authService.verifyEmail(validatedData);

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Email vérifié avec succès',
      data: {
        verifiedAt: new Date().toISOString(),
        email: validatedData.email
      },
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
    const cleanedData = {
      email: String(req.body.email || '').toLowerCase().trim()
    };

    const validatedData = forgotPasswordSchema.parse(cleanedData) as ForgotPasswordInput;

    // Demander la réinitialisation avec gestion d'erreur
    try {
      await authService.forgotPassword(validatedData);
    } catch (error) {
      console.error('Erreur demande réinitialisation:', error);
    }

    // Réponse toujours succès pour la sécurité
    const response: ApiResponse = {
      success: true,
      message: 'Si un compte existe avec cet email, vous recevrez un lien de réinitialisation',
      data: {
        requestedAt: new Date().toISOString()
      },
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
    const cleanedData = {
      token: String(req.body.token || '').trim(),
      password: String(req.body.password || ''),
      confirmPassword: String(req.body.confirmPassword || '')
    };

    const validatedData = resetPasswordSchema.parse(cleanedData) as ResetPasswordInput;

    // Réinitialiser
    await authService.resetPassword(validatedData);

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Mot de passe réinitialisé avec succès',
      data: {
        resetAt: new Date().toISOString()
      },
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

    // Récupérer les données utilisateur complètes avec gestion d'erreur
    try {
      const user = await this.getUserWithProfile(userId);

      if (!user) {
        const response: ApiResponse = {
          success: false,
          message: 'Utilisateur non trouvé',
          error: 'USER_NOT_FOUND',
          timestamp: new Date().toISOString()
        };
        return res.status(HTTP_STATUS.NOT_FOUND).json(response);
      }

      // Réponse
      const response: ApiResponse = {
        success: true,
        message: 'Profil utilisateur récupéré',
        data: { 
          user: this.formatUserProfile(user),
          lastAccessed: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      };

      res.status(HTTP_STATUS.OK).json(response);
    } catch (error) {
      console.error('Erreur récupération profil:', error);
      
      const response: ApiResponse = {
        success: false,
        message: 'Impossible de récupérer le profil',
        error: 'PROFILE_FETCH_ERROR',
        timestamp: new Date().toISOString()
      };

      res.status(HTTP_STATUS.SERVER_ERROR).json(response);
    }
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
        authenticated: true,
        checkedAt: new Date().toISOString()
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

    try {
      // Récupérer la session courante depuis Redis
      const currentSession = await redisUtils.getUserSession(userId);

      // TODO: Implémenter la gestion multi-sessions si nécessaire
      const sessions = currentSession ? [
        {
          id: 'current',
          deviceInfo: this.extractDeviceInfo(req.get('User-Agent') || ''),
          location: 'Dakar, Sénégal', // À implémenter avec géolocalisation IP
          loginTime: currentSession.loginTime || new Date(),
          lastActivity: currentSession.lastActivity || new Date(),
          ipAddress: req.ip,
          isCurrent: true
        }
      ] : [];

      const response: ApiResponse = {
        success: true,
        message: 'Sessions actives récupérées',
        data: { 
          sessions,
          totalSessions: sessions.length,
          retrievedAt: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      };

      res.status(HTTP_STATUS.OK).json(response);
    } catch (error) {
      console.error('Erreur récupération sessions:', error);
      
      const response: ApiResponse = {
        success: true,
        message: 'Sessions actives récupérées',
        data: { 
          sessions: [],
          totalSessions: 0,
          error: 'Session data unavailable'
        },
        timestamp: new Date().toISOString()
      };

      res.status(HTTP_STATUS.OK).json(response);
    }
  });

  /**
   * Révoquer une session spécifique
   * DELETE /api/v1/auth/sessions/:sessionId
   */
  revokeSession = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.userId;
    const { sessionId } = req.params;

    if (!sessionId || sessionId.trim().length === 0) {
      const response: ApiResponse = {
        success: false,
        message: 'ID de session requis',
        error: 'MISSING_SESSION_ID',
        timestamp: new Date().toISOString()
      };
      return res.status(HTTP_STATUS.BAD_REQUEST).json(response);
    }

    try {
      // Pour l'instant, on ne gère qu'une session par utilisateur
      if (sessionId === 'current') {
        await authService.logout(userId);
      }

      const response: ApiResponse = {
        success: true,
        message: 'Session révoquée',
        data: {
          revokedSessionId: sessionId,
          revokedAt: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      };

      res.status(HTTP_STATUS.OK).json(response);
    } catch (error) {
      console.error('Erreur révocation session:', error);
      
      const response: ApiResponse = {
        success: false,
        message: 'Impossible de révoquer la session',
        error: 'SESSION_REVOCATION_ERROR',
        timestamp: new Date().toISOString()
      };

      res.status(HTTP_STATUS.SERVER_ERROR).json(response);
    }
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

  /**
   * Extraire les informations du dispositif depuis User-Agent
   */
  private extractDeviceInfo(userAgent: string): string {
    if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
      return 'Appareil Mobile';
    } else if (userAgent.includes('Tablet') || userAgent.includes('iPad')) {
      return 'Tablette';
    } else if (userAgent.includes('Windows')) {
      return 'Ordinateur Windows';
    } else if (userAgent.includes('Mac')) {
      return 'Ordinateur Mac';
    } else if (userAgent.includes('Linux')) {
      return 'Ordinateur Linux';
    } else {
      return 'Navigateur Web';
    }
  }

  /**
   * Valider et nettoyer les données d'entrée
   */
  private sanitizeInput(data: any): any {
    if (typeof data === 'string') {
      return data.trim();
    }
    if (typeof data === 'object' && data !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(data)) {
        sanitized[key] = this.sanitizeInput(value);
      }
      return sanitized;
    }
    return data;
  }
}

// Export de l'instance
export const authController = new AuthController();