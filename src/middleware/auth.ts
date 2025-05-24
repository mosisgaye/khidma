import { Request, Response, NextFunction } from 'express';
import { UserRole, UserStatus } from '@prisma/client';
import { verifyAccessToken, JwtPayload } from '@/config/jwt';
import { AuthenticatedRequest } from '@/types/api.types';
import { AuthErrorCode } from '@/types/auth.types';
import { HTTP_STATUS } from '@/types/api.types';
import prisma from '@/config/database';
import { redisUtils } from '@/config/redis';


// ============ INTERFACES ============

interface AuthMiddlewareOptions {
  required?: boolean;
  roles?: UserRole[];
  permissions?: string[];
  checkStatus?: boolean;
}

// ============ MIDDLEWARE PRINCIPAL ============

/**
 * Middleware d'authentification JWT
 */
export const authenticate = (options: AuthMiddlewareOptions = {}) => {
  const {
    required = true,
    roles = [],
    permissions = [],
    checkStatus = true
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extraire le token de l'en-tête Authorization
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : null;

      // Si le token n'est pas requis et absent
      if (!required && !token) {
        return next();
      }

      // Si le token est requis mais absent
      if (required && !token) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: 'Token d\'authentification requis',
          error: AuthErrorCode.TOKEN_INVALID,
          timestamp: new Date().toISOString()
        });
      }

      if (!token) {
        return next();
      }

      // Vérifier le token JWT
      let payload: JwtPayload;
      try {
        payload = verifyAccessToken(token);
      } catch (error) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: 'Token d\'authentification invalide',
          error: AuthErrorCode.TOKEN_INVALID,
          timestamp: new Date().toISOString()
        });
      }

      // Vérifier si l'utilisateur existe toujours
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        include: {
          expediteurProfile: true,
          transporteurProfile: true,
          clientProfile: true
        }
      });

      if (!user) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: 'Utilisateur non trouvé',
          error: AuthErrorCode.TOKEN_INVALID,
          timestamp: new Date().toISOString()
        });
      }

      // Vérifier le statut du compte si demandé
      if (checkStatus) {
        if (user.status === UserStatus.SUSPENDED) {
          return res.status(HTTP_STATUS.FORBIDDEN).json({
            success: false,
            message: 'Compte suspendu',
            error: AuthErrorCode.ACCOUNT_SUSPENDED,
            timestamp: new Date().toISOString()
          });
        }

        if (user.status === UserStatus.BANNED) {
          return res.status(HTTP_STATUS.FORBIDDEN).json({
            success: false,
            message: 'Compte banni',
            error: AuthErrorCode.ACCOUNT_SUSPENDED,
            timestamp: new Date().toISOString()
          });
        }

        if (user.status === UserStatus.INACTIVE) {
          return res.status(HTTP_STATUS.FORBIDDEN).json({
            success: false,
            message: 'Compte inactif',
            error: AuthErrorCode.ACCOUNT_SUSPENDED,
            timestamp: new Date().toISOString()
          });
        }
      }

      // Vérifier les rôles si spécifiés
      if (roles.length > 0 && !roles.includes(user.role)) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: 'Permissions insuffisantes',
          error: AuthErrorCode.AUTHORIZATION_ERROR,
          timestamp: new Date().toISOString()
        });
      }

      // Vérifier les permissions spécifiques (si implémentées)
      if (permissions.length > 0) {
        const hasPermissions = await checkUserPermissions(user.id, permissions);
        if (!hasPermissions) {
          return res.status(HTTP_STATUS.FORBIDDEN).json({
            success: false,
            message: 'Permissions spécifiques insuffisantes',
            error: AuthErrorCode.AUTHORIZATION_ERROR,
            timestamp: new Date().toISOString()
          });
        }
      }

      // Mettre à jour l'activité utilisateur en arrière-plan
      updateUserActivity(user.id, req.ip, req.get('User-Agent'));

      // Ajouter l'utilisateur à la requête
      (req as AuthenticatedRequest).user = {
        userId: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName
      };

      next();
    } catch (error) {
      console.error('Erreur middleware authentification:', error);
      return res.status(HTTP_STATUS.SERVER_ERROR).json({
        success: false,
        message: 'Erreur interne du serveur',
        error: 'SERVER_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  };
};

// ============ MIDDLEWARES SPÉCIALISÉS ============

/**
 * Middleware pour les routes optionnellement authentifiées
 */
export const optionalAuth = authenticate({ required: false });

/**
 * Middleware pour les administrateurs uniquement
 */
export const requireAdmin = authenticate({
  roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN]
});

/**
 * Middleware pour les transporteurs
 */
export const requireTransporteur = authenticate({
  roles: [UserRole.TRANSPORTEUR, UserRole.ADMIN, UserRole.SUPER_ADMIN]
});

/**
 * Middleware pour les expéditeurs
 */
export const requireExpediteur = authenticate({
  roles: [UserRole.EXPEDITEUR, UserRole.ADMIN, UserRole.SUPER_ADMIN]
});

/**
 * Middleware pour les clients boutique
 */
export const requireClient = authenticate({
  roles: [UserRole.CLIENT_BOUTIQUE, UserRole.ADMIN, UserRole.SUPER_ADMIN]
});

/**
 * Middleware pour vérifier la propriété d'une ressource
 */
export const requireOwnership = (getResourceOwnerId: (req: Request) => Promise<string>) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Vérifier d'abord l'authentification
      if (!req.user) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: 'Authentification requise',
          error: AuthErrorCode.TOKEN_INVALID,
          timestamp: new Date().toISOString()
        });
      }

      // Les admins ont accès à tout
      if (req.user.role === UserRole.ADMIN || req.user.role === UserRole.SUPER_ADMIN) {
        return next();
      }

      // Obtenir l'ID du propriétaire de la ressource
      const resourceOwnerId = await getResourceOwnerId(req);

      // Vérifier la propriété
      if (req.user.userId !== resourceOwnerId) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: 'Accès interdit à cette ressource',
          error: AuthErrorCode.AUTHORIZATION_ERROR,
          timestamp: new Date().toISOString()
        });
      }

      next();
    } catch (error) {
      console.error('Erreur vérification propriété:', error);
      return res.status(HTTP_STATUS.SERVER_ERROR).json({
        success: false,
        message: 'Erreur lors de la vérification des permissions',
        error: 'SERVER_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  };
};

// ============ FONCTIONS UTILITAIRES ============

/**
 * Vérifier les permissions utilisateur (à implémenter selon les besoins)
 */
const checkUserPermissions = async (userId: string, permissions: string[]): Promise<boolean> => {
  // TODO: Implémenter le système de permissions granulaires
  // Pour l'instant, on retourne true
  return true;
};

/**
 * Mettre à jour l'activité utilisateur (non-bloquant)
 */
const updateUserActivity = async (userId: string, ipAddress?: string, userAgent?: string) => {
  try {
    // Mettre à jour en base (non-bloquant)
    prisma.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress
      }
    }).catch(error => {
      console.error('Erreur mise à jour activité utilisateur:', error);
    });

    // Mettre à jour la session Redis
    await redisUtils.setUserSession(userId, {
      lastActivity: new Date(),
      ipAddress,
      userAgent
    }, 3600); // 1 heure
  } catch (error) {
    console.error('Erreur mise à jour activité:', error);
  }
};

/**
 * Extraire l'utilisateur de la requête
 */
export const getCurrentUser = (req: Request): JwtPayload | null => {
  return (req as AuthenticatedRequest).user || null;
};

/**
 * Vérifier si l'utilisateur a un rôle spécifique
 */
export const hasRole = (req: Request, roles: UserRole[]): boolean => {
  const user = getCurrentUser(req);
  return user ? roles.includes(user.role) : false;
};

/**
 * Vérifier si l'utilisateur est admin
 */
export const isAdmin = (req: Request): boolean => {
  return hasRole(req, [UserRole.ADMIN, UserRole.SUPER_ADMIN]);
};

/**
 * Vérifier si l'utilisateur est le propriétaire ou admin
 */
export const isOwnerOrAdmin = (req: Request, resourceOwnerId: string): boolean => {
  const user = getCurrentUser(req);
  if (!user) return false;
  
  return user.userId === resourceOwnerId || isAdmin(req);
};