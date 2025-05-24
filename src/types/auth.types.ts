import { UserRole, UserStatus } from '@prisma/client';
import { TokenPair } from '@/config/jwt';

// ============ TYPES D'AUTHENTIFICATION ============
export interface RegisterData {
    email: string;
    password: string;
    confirmPassword: string;
    firstName: string;
    lastName: string;
    phone?: string;
    role: UserRole;
    acceptTerms: boolean;
    companyName?: string;
    siret?: string;
    licenseNumber?: string;
  }
  
  export interface LoginData {
    email: string;
    password: string;
    rememberMe?: boolean;
  }
// Données d'inscription
export interface RegisterData {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: UserRole;
  acceptTerms: boolean;
  companyName?: string; // Pour transporteurs et entreprises
  siret?: string; // Pour entreprises
}

// Données de connexion
export interface LoginData {
  email: string;
  password: string;
  rememberMe?: boolean;
}

// Données de connexion par téléphone
export interface PhoneLoginData {
  phone: string;
  password: string;
  rememberMe?: boolean;
}

// Réponse d'authentification
export interface AuthResponse {
  user: AuthUser;
  tokens: TokenPair;
  isFirstLogin?: boolean;
  requiresTwoFactor?: boolean;
}

// Utilisateur authentifié (données exposées)
export interface AuthUser {
  id: string;
  email: string;
  phone?: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  avatar?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  twoFactorEnabled: boolean;
  preferredLanguage: string;
  timezone: string;
  lastLoginAt?: Date;
  createdAt: Date;
  permissions?: string[];
  profile?: UserProfile;
}

// Profil utilisateur selon le rôle
export type UserProfile = ExpéditeurProfile | TransporteurProfile | ClientProfile;

export interface ExpéditeurProfile {
  type: 'EXPEDITEUR';
  companyName?: string;
  companySize?: string;
  businessSector?: string;
  siret?: string;
  website?: string;
  verified: boolean;
  totalOrders: number;
}

export interface TransporteurProfile {
  type: 'TRANSPORTEUR';
  companyName?: string;
  licenseNumber: string;
  licenseExpiryDate?: Date;
  siret?: string;
  fleetSize: number;
  verified: boolean;
  rating?: number;
  totalRides: number;
  completionRate?: number;
  isOnline: boolean;
}

export interface ClientProfile {
  type: 'CLIENT_BOUTIQUE';
  companyName?: string;
  customerType: string;
  loyaltyPoints: number;
  totalSpent: number;
  preferredPayment?: string;
}

// ============ TYPES DE VÉRIFICATION ============

// Vérification email
export interface EmailVerificationData {
  email: string;
  token: string;
}

// Vérification téléphone
export interface PhoneVerificationData {
  phone: string;
  code: string;
}

// Demande de réinitialisation mot de passe
export interface ForgotPasswordData {
  email: string;
}

// Réinitialisation mot de passe
export interface ResetPasswordData {
  token: string;
  password: string;
  confirmPassword: string;
}

// ============ TYPES 2FA ============

// Activation 2FA
export interface Enable2FAData {
  password: string;
  code?: string;
}

// Vérification 2FA
export interface Verify2FAData {
  userId: string;
  code: string;
  token?: string;
}

// Réponse 2FA
export interface TwoFactorResponse {
  qrCode?: string;
  secret?: string;
  backupCodes?: string[];
}

// ============ TYPES DE SESSION ============

// Données de session
export interface SessionData {
  userId: string;
  email: string;
  role: UserRole;
  loginTime: Date;
  lastActivity: Date;
  ipAddress?: string;
  userAgent?: string;
  deviceId?: string;
}

// Session active
export interface ActiveSession {
  id: string;
  deviceInfo: string;
  location?: string;
  loginTime: Date;
  lastActivity: Date;
  isCurrent: boolean;
}

// ============ TYPES DE VALIDATION ============

// Validation du mot de passe
export interface PasswordValidation {
  isValid: boolean;
  score: number; // 0-4
  feedback: string[];
  requirements: {
    length: boolean;
    uppercase: boolean;
    lowercase: boolean;
    numbers: boolean;
    symbols: boolean;
  };
}

// ============ TYPES DE SÉCURITÉ ============

// Tentative de connexion
export interface LoginAttempt {
  email: string;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  timestamp: Date;
  reason?: string;
}

// Activité suspecte
export interface SuspiciousActivity {
  userId: string;
  type: 'MULTIPLE_FAILED_LOGINS' | 'UNUSUAL_LOCATION' | 'NEW_DEVICE' | 'PASSWORD_CHANGE';
  details: any;
  timestamp: Date;
  resolved: boolean;
}

// ============ TYPES DE PERMISSIONS ============

// Permission
export interface Permission {
  resource: string;
  action: string;
  conditions?: Record<string, any>;
}

// Rôle avec permissions
export interface RoleWithPermissions {
  role: UserRole;
  permissions: Permission[];
  restrictions?: Record<string, any>;
}

// ============ TYPES DE REFRESH TOKEN ============

// Données refresh token
export interface RefreshTokenData {
  refreshToken: string;
}

// Révocation de token
export interface RevokeTokenData {
  token: string;
  revokeAll?: boolean;
}

// ============ TYPES D'ERREUR D'AUTH ============

export enum AuthErrorCode {
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED',
  ACCOUNT_NOT_VERIFIED = 'ACCOUNT_NOT_VERIFIED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  TWO_FACTOR_REQUIRED = 'TWO_FACTOR_REQUIRED',
  TWO_FACTOR_INVALID = 'TWO_FACTOR_INVALID',
  PASSWORD_TOO_WEAK = 'PASSWORD_TOO_WEAK',
  EMAIL_ALREADY_EXISTS = 'EMAIL_ALREADY_EXISTS',
  PHONE_ALREADY_EXISTS = 'PHONE_ALREADY_EXISTS',
  VERIFICATION_CODE_INVALID = 'VERIFICATION_CODE_INVALID',
  VERIFICATION_CODE_EXPIRED = 'VERIFICATION_CODE_EXPIRED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED'
}

// ============ CONSTANTES ============

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const MAX_LOGIN_ATTEMPTS = 5;
export const ACCOUNT_LOCK_DURATION = 15 * 60; // 15 minutes en secondes
export const EMAIL_VERIFICATION_EXPIRY = 24 * 60 * 60; // 24 heures
export const PHONE_VERIFICATION_EXPIRY = 10 * 60; // 10 minutes
export const PASSWORD_RESET_EXPIRY = 1 * 60 * 60; // 1 heure
export const TWO_FACTOR_CODE_LENGTH = 6;
export const BACKUP_CODES_COUNT = 10;