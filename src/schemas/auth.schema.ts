import { z } from 'zod';
import { UserRole } from '@prisma/client';

// ============ SCHÉMAS DE BASE ============

// Email
export const emailSchema = z
  .string()
  .email('Format email invalide')
  .min(5, 'Email trop court')
  .max(255, 'Email trop long')
  .toLowerCase()
  .transform(email => email.trim());

// Téléphone sénégalais
export const phoneSchema = z
  .string()
  .regex(
    /^(\+221|221)?[0-9]{9}$/,
    'Format téléphone invalide. Utilisez le format sénégalais: +221XXXXXXXXX'
  )
  .transform(phone => {
    // Normaliser le format
    const cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.length === 9) return `+221${cleaned}`;
    if (cleaned.length === 12 && cleaned.startsWith('221')) return `+${cleaned}`;
    return phone;
  });

// Mot de passe
export const passwordSchema = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
  .max(128, 'Le mot de passe ne peut pas dépasser 128 caractères')
  .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
  .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule')
  .regex(/\d/, 'Le mot de passe doit contenir au moins un chiffre')
  .regex(/[^A-Za-z0-9]/, 'Le mot de passe doit contenir au moins un caractère spécial');

// Nom
export const nameSchema = z
  .string()
  .min(2, 'Minimum 2 caractères')
  .max(50, 'Maximum 50 caractères')
  .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, 'Caractères invalides dans le nom')
  .transform(name => name.trim());

// Rôle utilisateur
export const userRoleSchema = z.nativeEnum(UserRole, {
  errorMap: () => ({ message: 'Rôle utilisateur invalide' })
});

// ============ INSCRIPTION ============

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
  firstName: nameSchema,
  lastName: nameSchema,
  phone: phoneSchema.optional(),
  role: userRoleSchema,
  acceptTerms: z.boolean().refine(val => val === true, {
    message: 'Vous devez accepter les conditions d\'utilisation'
  }),
  
  // Champs conditionnels selon le rôle
  companyName: z.string()
    .min(2, 'Nom d\'entreprise trop court')
    .max(100, 'Nom d\'entreprise trop long')
    .optional(),
  
  siret: z.string()
    .regex(/^[0-9]{14}$/, 'Numéro SIRET invalide (14 chiffres)')
    .optional(),
    
  licenseNumber: z.string()
    .min(5, 'Numéro de licence trop court')
    .max(20, 'Numéro de licence trop long')
    .optional()
    
}).refine(data => data.password === data.confirmPassword, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirmPassword']
}).refine(data => {
  // Validation conditionnelle selon le rôle
  if (data.role === UserRole.TRANSPORTEUR) {
    return data.companyName && data.licenseNumber;
  }
  return true;
}, {
  message: 'Nom d\'entreprise et numéro de licence requis pour les transporteurs',
  path: ['companyName']
});

// ============ CONNEXION ============

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Mot de passe requis'),
  rememberMe: z.boolean().optional().default(false)
});

export const phoneLoginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, 'Mot de passe requis'),
  rememberMe: z.boolean().optional().default(false)
});

// ============ VÉRIFICATION ============

export const emailVerificationSchema = z.object({
  email: emailSchema,
  token: z.string()
    .min(32, 'Token de vérification invalide')
    .max(255, 'Token de vérification invalide')
});

export const phoneVerificationSchema = z.object({
  phone: phoneSchema,
  code: z.string()
    .regex(/^[0-9]{6}$/, 'Code de vérification invalide (6 chiffres)')
});

// ============ MOT DE PASSE ============

export const forgotPasswordSchema = z.object({
  email: emailSchema
});

export const resetPasswordSchema = z.object({
  token: z.string().min(32, 'Token de réinitialisation invalide'),
  password: passwordSchema,
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirmPassword']
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
  newPassword: passwordSchema,
  confirmPassword: z.string()
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'Les nouveaux mots de passe ne correspondent pas',
  path: ['confirmPassword']
}).refine(data => data.currentPassword !== data.newPassword, {
  message: 'Le nouveau mot de passe doit être différent de l\'actuel',
  path: ['newPassword']
});

// ============ AUTHENTIFICATION À DEUX FACTEURS ============

export const enable2FASchema = z.object({
  password: z.string().min(1, 'Mot de passe requis pour activer 2FA'),
  code: z.string()
    .regex(/^[0-9]{6}$/, 'Code 2FA invalide (6 chiffres)')
    .optional()
});

export const verify2FASchema = z.object({
  code: z.string()
    .regex(/^[0-9]{6}$/, 'Code 2FA invalide (6 chiffres)'),
  token: z.string().optional() // Token temporaire pour la vérification
});

export const disable2FASchema = z.object({
  password: z.string().min(1, 'Mot de passe requis pour désactiver 2FA'),
  code: z.string()
    .regex(/^[0-9]{6}$/, 'Code 2FA invalide (6 chiffres)')
});

// ============ TOKENS ============

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token requis')
});

export const revokeTokenSchema = z.object({
  token: z.string().min(1, 'Token requis'),
  revokeAll: z.boolean().optional().default(false)
});

// ============ PROFIL UTILISATEUR ============

export const updateProfileSchema = z.object({
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  phone: phoneSchema.optional(),
  preferredLanguage: z.enum(['fr', 'en', 'wo'], {
    errorMap: () => ({ message: 'Langue non supportée' })
  }).optional(),
  timezone: z.string().optional(),
  
  // Champs spécifiques selon le rôle
  companyName: z.string()
    .min(2, 'Nom d\'entreprise trop court')
    .max(100, 'Nom d\'entreprise trop long')
    .optional(),
    
  website: z.string()
    .url('URL de site web invalide')
    .optional()
    .or(z.literal('')),
    
  description: z.string()
    .max(500, 'Description trop longue')
    .optional()
});

// ============ VALIDATION DES SESSIONS ============

export const sessionValidationSchema = z.object({
  deviceId: z.string().optional(),
  ipAddress: z.string().ip().optional(),
  userAgent: z.string().max(500).optional()
});

// ============ VALIDATION ADMIN ============

export const adminUserUpdateSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'BANNED'], {
    errorMap: () => ({ message: 'Statut utilisateur invalide' })
  }).optional(),
  
  role: userRoleSchema.optional(),
  
  emailVerified: z.boolean().optional(),
  phoneVerified: z.boolean().optional(),
  
  notes: z.string().max(1000, 'Notes trop longues').optional()
});

// ============ TYPES INFÉRÉS ============

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PhoneLoginInput = z.infer<typeof phoneLoginSchema>;
export type EmailVerificationInput = z.infer<typeof emailVerificationSchema>;
export type PhoneVerificationInput = z.infer<typeof phoneVerificationSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type Enable2FAInput = z.infer<typeof enable2FASchema>;
export type Verify2FAInput = z.infer<typeof verify2FASchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;

// ============ HELPERS DE VALIDATION ============

/**
 * Valider un email de manière synchrone
 */
export const isValidEmail = (email: string): boolean => {
  try {
    emailSchema.parse(email);
    return true;
  } catch {
    return false;
  }
};

/**
 * Valider un téléphone de manière synchrone
 */
export const isValidPhone = (phone: string): boolean => {
  try {
    phoneSchema.parse(phone);
    return true;
  } catch {
    return false;
  }
};

/**
 * Valider un mot de passe de manière synchrone
 */
export const isValidPassword = (password: string): boolean => {
  try {
    passwordSchema.parse(password);
    return true;
  } catch {
    return false;
  }
};