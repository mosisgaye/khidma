import bcrypt from 'bcryptjs';
import { PasswordValidation } from '@/types/auth.types';

// ============ CONFIGURATION ============

const SALT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

// ============ HASHAGE ET VÉRIFICATION ============

/**
 * Hasher un mot de passe
 */
export const hashPassword = async (password: string): Promise<string> => {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères`);
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`Le mot de passe ne peut pas dépasser ${MAX_PASSWORD_LENGTH} caractères`);
  }

  return await bcrypt.hash(password, SALT_ROUNDS);
};

/**
 * Vérifier un mot de passe
 */
export const verifyPassword = async (password: string, hashedPassword: string): Promise<boolean> => {
  if (!password || !hashedPassword) {
    return false;
  }

  try {
    return await bcrypt.compare(password, hashedPassword);
  } catch (error) {
    console.error('Erreur lors de la vérification du mot de passe:', error);
    return false;
  }
};

// ============ VALIDATION DES MOTS DE PASSE ============

/**
 * Valider la force d'un mot de passe
 */
export const validatePasswordStrength = (password: string): PasswordValidation => {
  const requirements = {
    length: password.length >= MIN_PASSWORD_LENGTH,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    numbers: /\d/.test(password),
    symbols: /[^A-Za-z0-9]/.test(password),
  };

  const feedback: string[] = [];
  let score = 0;

  // Vérification de la longueur
  if (!requirements.length) {
    feedback.push(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères`);
  } else {
    score += 1;
    if (password.length >= 12) score += 1;
    if (password.length >= 16) score += 1;
  }

  // Vérification des majuscules
  if (!requirements.uppercase) {
    feedback.push('Ajoutez au moins une lettre majuscule');
  } else {
    score += 1;
  }

  // Vérification des minuscules
  if (!requirements.lowercase) {
    feedback.push('Ajoutez au moins une lettre minuscule');
  } else {
    score += 1;
  }

  // Vérification des chiffres
  if (!requirements.numbers) {
    feedback.push('Ajoutez au moins un chiffre');
  } else {
    score += 1;
  }

  // Vérification des symboles
  if (!requirements.symbols) {
    feedback.push('Ajoutez au moins un caractère spécial (!@#$%^&*)');
  } else {
    score += 1;
  }

  // Vérifications avancées
  if (password.length >= 12 && hasVariedCharacters(password)) {
    score += 1;
  }

  if (!hasCommonPatterns(password)) {
    score += 1;
  }

  // Messages de feedback selon le score
  if (score <= 2) {
    feedback.unshift('Mot de passe très faible');
  } else if (score <= 4) {
    feedback.unshift('Mot de passe faible');
  } else if (score <= 6) {
    feedback.unshift('Mot de passe moyen');
  } else if (score <= 7) {
    feedback.unshift('Mot de passe fort');
  } else {
    feedback.length = 0;
    feedback.push('Excellent mot de passe !');
  }

  const isValid = Object.values(requirements).every(req => req === true) && score >= 4;

  return {
    isValid,
    score: Math.min(score, 4), // Score max de 4
    feedback,
    requirements,
  };
};

// ============ FONCTIONS UTILITAIRES ============

/**
 * Vérifier si le mot de passe a des caractères variés
 */
const hasVariedCharacters = (password: string): boolean => {
  const charTypes = new Set();
  
  for (const char of password) {
    if (/[A-Z]/.test(char)) charTypes.add('upper');
    else if (/[a-z]/.test(char)) charTypes.add('lower');
    else if (/\d/.test(char)) charTypes.add('digit');
    else charTypes.add('symbol');
  }
  
  return charTypes.size >= 3;
};

/**
 * Vérifier les motifs communs faibles
 */
const hasCommonPatterns = (password: string): boolean => {
  const commonPatterns = [
    /123456/,
    /abcdef/,
    /qwerty/,
    /password/i,
    /azerty/,
    /admin/i,
    /user/i,
    /guest/i,
    /test/i,
    /(.)\1{2,}/, // 3+ caractères identiques consécutifs
    /012345/,
    /987654/,
  ];

  return commonPatterns.some(pattern => pattern.test(password));
};

/**
 * Générer un mot de passe sécurisé
 */
export const generateSecurePassword = (length: number = 16): string => {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  const allChars = uppercase + lowercase + numbers + symbols;
  
  let password = '';
  
  // Garantir au moins un caractère de chaque type
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];
  
  // Remplir le reste aléatoirement
  for (let i = 4; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Mélanger les caractères
  return password.split('').sort(() => 0.5 - Math.random()).join('');
};

/**
 * Générer des codes de récupération
 */
export const generateBackupCodes = (count: number = 10): string[] => {
  const codes: string[] = [];
  
  for (let i = 0; i < count; i++) {
    // Générer un code de 8 caractères alphanumériques
    const code = Math.random().toString(36).substr(2, 4) + 
                 Math.random().toString(36).substr(2, 4);
    codes.push(code.toUpperCase());
  }
  
  return codes;
};

/**
 * Vérifier si un mot de passe a été compromis (simulation)
 * En production, intégrer avec une API comme HaveIBeenPwned
 */
export const checkPasswordBreach = async (password: string): Promise<boolean> => {
  // TODO: Intégrer avec HaveIBeenPwned API
  // Pour le moment, on vérifie juste les mots de passe très communs
  const commonPasswords = [
    'password',
    '123456',
    '123456789',
    'qwerty',
    'abc123',
    'password123',
    'admin',
    'welcome',
    'azerty',
    'motdepasse'
  ];
  
  return commonPasswords.includes(password.toLowerCase());
};

/**
 * Estimer le temps de crack d'un mot de passe
 */
export const estimateCrackTime = (password: string): string => {
  const charset = getCharsetSize(password);
  const entropy = Math.log2(Math.pow(charset, password.length));
  
  // Estimation très simplifiée
  const attempts = Math.pow(2, entropy - 1);
  const attemptsPerSecond = 1000000000; // 1 milliard de tentatives/seconde
  
  const seconds = attempts / attemptsPerSecond;
  
  if (seconds < 60) return 'Moins d\'une minute';
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} minutes`;
  if (seconds < 86400) return `${Math.ceil(seconds / 3600)} heures`;
  if (seconds < 31536000) return `${Math.ceil(seconds / 86400)} jours`;
  if (seconds < 31536000000) return `${Math.ceil(seconds / 31536000)} années`;
  
  return 'Des siècles';
};

/**
 * Calculer la taille du jeu de caractères
 */
const getCharsetSize = (password: string): number => {
  let size = 0;
  
  if (/[a-z]/.test(password)) size += 26;
  if (/[A-Z]/.test(password)) size += 26;
  if (/\d/.test(password)) size += 10;
  if (/[^A-Za-z0-9]/.test(password)) size += 32; // Estimation des symboles
  
  return size;
};