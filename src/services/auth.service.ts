import { UserRole, UserStatus, User } from '@prisma/client';
import { 
  RegisterData, 
  LoginData, 
  AuthResponse, 
  AuthUser, 
  AuthErrorCode,
  EmailVerificationData,
  PhoneVerificationData,
  ForgotPasswordData,
  ResetPasswordData
} from '@/types/auth.types';
import { generateTokens, verifyRefreshToken, TokenPair } from '@/config/jwt';
import { hashPassword, verifyPassword } from '@/utils/password.util';
import { 
  ConflictError, 
  AuthenticationError, 
  NotFoundError, 
  ValidationError 
} from '@/middleware/errorHandler';
import prisma from '@/config/database';
import { redisUtils } from '@/config/redis';
import crypto from 'crypto';

// ============ SERVICE D'AUTHENTIFICATION ============

export class AuthService {

  // ============ INSCRIPTION ============

  /**
   * Créer un nouveau compte utilisateur
   */
  async register(data: RegisterData): Promise<AuthResponse> {
    // Vérifier si l'email existe déjà
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (existingUser) {
      throw new ConflictError('Un compte avec cet email existe déjà');
    }

    // Vérifier si le téléphone existe déjà (si fourni)
    if (data.phone) {
      const existingPhone = await prisma.user.findUnique({
        where: { phone: data.phone }
      });

      if (existingPhone) {
        throw new ConflictError('Un compte avec ce numéro de téléphone existe déjà');
      }
    }

    // Hasher le mot de passe
    const hashedPassword = await hashPassword(data.password);

    // Créer l'utilisateur en transaction
    const user = await prisma.$transaction(async (tx) => {
      // Créer l'utilisateur principal
      const newUser = await tx.user.create({
        data: {
          email: data.email,
          password: hashedPassword,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          role: data.role,
          status: UserStatus.PENDING_VERIFICATION
        }
      });

      // Créer le profil selon le rôle
      await this.createUserProfile(tx, newUser.id, data);

      return newUser;
    });

    // Envoyer l'email de vérification
    await this.sendEmailVerification(user.email);

    // Générer les tokens
    const tokens = generateTokens(user);

    // Créer la session
    await redisUtils.setUserSession(user.id, {
      userId: user.id,
      email: user.email,
      role: user.role,
      loginTime: new Date(),
      lastActivity: new Date()
    });

    return {
      user: this.formatAuthUser(user),
      tokens,
      isFirstLogin: true
    };
  }

  // ============ CONNEXION ============

  /**
   * Authentifier un utilisateur par email/mot de passe
   */
  async login(data: LoginData): Promise<AuthResponse> {
    // Trouver l'utilisateur
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: {
        expediteurProfile: true,
        transporteurProfile: true,
        clientProfile: true
      }
    });

    if (!user) {
      throw new AuthenticationError('Email ou mot de passe incorrect');
    }

    // Vérifier les tentatives de connexion
    await this.checkLoginAttempts(user.id);

    // Vérifier le mot de passe
    const isValidPassword = await verifyPassword(data.password, user.password);
    if (!isValidPassword) {
      await this.recordFailedLogin(user.id);
      throw new AuthenticationError('Email ou mot de passe incorrect');
    }

    // Vérifier le statut du compte
    if (user.status === UserStatus.BANNED) {
      throw new AuthenticationError('Compte banni', AuthErrorCode.ACCOUNT_SUSPENDED);
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new AuthenticationError('Compte suspendu', AuthErrorCode.ACCOUNT_SUSPENDED);
    }

    // Générer les tokens
    const tokens = generateTokens(user);

    // Mettre à jour les informations de connexion
    await this.updateLoginInfo(user.id);

    // Créer la session
    await redisUtils.setUserSession(user.id, {
      userId: user.id,
      email: user.email,
      role: user.role,
      loginTime: new Date(),
      lastActivity: new Date()
    });

    // Vérifier si 2FA est requis
    const requiresTwoFactor = user.twoFactorEnabled;

    return {
      user: this.formatAuthUser(user),
      tokens,
      requiresTwoFactor
    };
  }

  // ============ REFRESH TOKEN ============

  /**
   * Rafraîchir les tokens d'accès
   */
  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    try {
      // Vérifier le refresh token
      const payload = verifyRefreshToken(refreshToken);

      // Vérifier si l'utilisateur existe toujours
      const user = await prisma.user.findUnique({
        where: { id: payload.userId }
      });

      if (!user) {
        throw new AuthenticationError('Utilisateur non trouvé');
      }

      // Vérifier le statut
      if (user.status !== UserStatus.ACTIVE && user.status !== UserStatus.PENDING_VERIFICATION) {
        throw new AuthenticationError('Compte inactif');
      }

      // Générer de nouveaux tokens
      return generateTokens(user);

    } catch (error) {
      throw new AuthenticationError('Refresh token invalide');
    }
  }

  // ============ DÉCONNEXION ============

  /**
   * Déconnecter un utilisateur
   */
  async logout(userId: string): Promise<void> {
    // Supprimer la session Redis
    await redisUtils.deleteUserSession(userId);

    // TODO: Ajouter le token à une blacklist si nécessaire
  }

  /**
   * Déconnecter de tous les appareils
   */
  async logoutAll(userId: string): Promise<void> {
    // Supprimer toutes les sessions
    await redisUtils.deleteUserSession(userId);

    // TODO: Blacklister tous les refresh tokens de l'utilisateur
  }

  // ============ VÉRIFICATION EMAIL ============

  /**
   * Envoyer un email de vérification
   */
  async sendEmailVerification(email: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      throw new NotFoundError('Utilisateur');
    }

    if (user.emailVerified) {
      throw new ValidationError([{
        field: 'email',
        message: 'Email déjà vérifié'
      }]);
    }

    // Générer un token de vérification
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    // Stocker en Redis
    await redisUtils.setCache(`email_verification:${token}`, {
      userId: user.id,
      email: user.email,
      expiresAt
    }, 24 * 60 * 60); // 24h

    // TODO: Envoyer l'email avec le token
    console.log(`Email de vérification pour ${email}: ${token}`);
  }

  /**
   * Vérifier l'email avec le token
   */
  async verifyEmail(data: EmailVerificationData): Promise<void> {
    // Récupérer les données du token
    const verificationData = await redisUtils.getCache(`email_verification:${data.token}`);

    if (!verificationData || verificationData.email !== data.email) {
      throw new AuthenticationError('Token de vérification invalide ou expiré');
    }

    // Mettre à jour l'utilisateur
    await prisma.user.update({
      where: { id: verificationData.userId },
      data: {
        emailVerified: true,
        status: UserStatus.ACTIVE
      }
    });

    // Supprimer le token
    await redisUtils.deleteCache(`email_verification:${data.token}`);
  }

  // ============ RÉINITIALISATION MOT DE PASSE ============

  /**
   * Demander une réinitialisation de mot de passe
   */
  async forgotPassword(data: ForgotPasswordData): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (!user) {
      // Ne pas révéler si l'email existe ou non
      return;
    }

    // Générer un token de réinitialisation
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h

    // Stocker en Redis
    await redisUtils.setCache(`password_reset:${token}`, {
      userId: user.id,
      email: user.email,
      expiresAt
    }, 60 * 60); // 1h

    // TODO: Envoyer l'email de réinitialisation
    console.log(`Réinitialisation mot de passe pour ${data.email}: ${token}`);
  }

  /**
   * Réinitialiser le mot de passe
   */
  async resetPassword(data: ResetPasswordData): Promise<void> {
    // Récupérer les données du token
    const resetData = await redisUtils.getCache(`password_reset:${data.token}`);

    if (!resetData) {
      throw new AuthenticationError('Token de réinitialisation invalide ou expiré');
    }

    // Hasher le nouveau mot de passe
    const hashedPassword = await hashPassword(data.password);

    // Mettre à jour le mot de passe
    await prisma.user.update({
      where: { id: resetData.userId },
      data: {
        password: hashedPassword,
        failedLoginAttempts: 0,
        lockedUntil: null
      }
    });

    // Supprimer le token
    await redisUtils.deleteCache(`password_reset:${data.token}`);

    // Déconnecter de tous les appareils
    await this.logoutAll(resetData.userId);
  }

  // ============ MÉTHODES PRIVÉES ============

  /**
   * Créer le profil utilisateur selon le rôle
   */
  private async createUserProfile(tx: any, userId: string, data: RegisterData): Promise<void> {
    switch (data.role) {
      case UserRole.EXPEDITEUR:
        await tx.expediteur.create({
          data: {
            userId,
            companyName: data.companyName,
            siret: data.siret
          }
        });
        break;

      case UserRole.TRANSPORTEUR:
        await tx.transporteur.create({
          data: {
            userId,
            companyName: data.companyName,
            licenseNumber: data.licenseNumber || `TEMP_${Date.now()}`,
            siret: data.siret
          }
        });
        break;

      case UserRole.CLIENT_BOUTIQUE:
        await tx.client.create({
          data: {
            userId,
            companyName: data.companyName
          }
        });
        break;
    }
  }

  /**
   * Formater les données utilisateur pour la réponse
   */
  private formatAuthUser(user: any): AuthUser {
    return {
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
  }

  /**
   * Vérifier les tentatives de connexion
   */
  private async checkLoginAttempts(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { failedLoginAttempts: true, lockedUntil: true }
    });

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw new AuthenticationError('Compte temporairement verrouillé', AuthErrorCode.ACCOUNT_LOCKED);
    }
  }

  /**
   * Enregistrer une tentative de connexion échouée
   */
  private async recordFailedLogin(userId: string): Promise<void> {
    const maxAttempts = 5;
    const lockDuration = 15 * 60 * 1000; // 15 minutes

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { failedLoginAttempts: true }
    });

    const attempts = (user?.failedLoginAttempts || 0) + 1;
    const updateData: any = { failedLoginAttempts: attempts };

    if (attempts >= maxAttempts) {
      updateData.lockedUntil = new Date(Date.now() + lockDuration);
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData
    });
  }

  /**
   * Mettre à jour les informations de connexion
   */
  private async updateLoginInfo(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null
      }
    });
  }

  // ============ MÉTHODES PUBLIQUES SUPPLÉMENTAIRES ============

  /**
   * Récupérer un utilisateur avec son profil complet
   */
  async getUserWithProfile(userId: string): Promise<any> {
    return await prisma.user.findUnique({
      where: { id: userId },
      include: {
        expediteurProfile: true,
        transporteurProfile: true,
        clientProfile: true,
        addresses: {
          where: { isActive: true },
          orderBy: { isDefault: 'desc' }
        }
      }
    });
  }

  /**
   * Mettre à jour le profil utilisateur
   */
  async updateProfile(userId: string, data: any): Promise<any> {
    // Séparer les données utilisateur des données de profil
    const { profile, ...userData } = data;

    const user = await prisma.user.update({
      where: { id: userId },
      data: userData,
      include: {
        expediteurProfile: true,
        transporteurProfile: true,
        clientProfile: true
      }
    });

    // Mettre à jour le profil spécifique si fourni
    if (profile) {
      await this.updateSpecificProfile(userId, user.role, profile);
    }

    return this.getUserWithProfile(userId);
  }

  /**
   * Mettre à jour un profil spécifique selon le rôle
   */
  private async updateSpecificProfile(userId: string, role: UserRole, profileData: any): Promise<void> {
    switch (role) {
      case UserRole.EXPEDITEUR:
        await prisma.expediteur.update({
          where: { userId },
          data: profileData
        });
        break;

      case UserRole.TRANSPORTEUR:
        await prisma.transporteur.update({
          where: { userId },
          data: profileData
        });
        break;

      case UserRole.CLIENT_BOUTIQUE:
        await prisma.client.update({
          where: { userId },
          data: profileData
        });
        break;
    }
  }
}

// Export de l'instance singleton
export const authService = new AuthService();