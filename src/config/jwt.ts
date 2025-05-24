import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';

// Configuration JWT
export const jwtConfig = {
  secret: process.env.JWT_SECRET || 'default-secret-change-in-production',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret',
  expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  issuer: 'khidma-service',
  audience: 'khidma-users',
} as const;

// Interface pour le payload JWT
export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

// Interface pour les tokens
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

// Générateur de tokens
export const generateTokens = (user: {
  id: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
}): TokenPair => {
  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
  };

  const accessToken = jwt.sign(payload, jwtConfig.secret, {
    expiresIn: jwtConfig.expiresIn,
    issuer: jwtConfig.issuer,
    audience: jwtConfig.audience,
  });

  const refreshToken = jwt.sign(
    { userId: user.id, tokenType: 'refresh' },
    jwtConfig.refreshSecret,
    {
      expiresIn: jwtConfig.refreshExpiresIn,
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience,
    }
  );

  // Calculer l'expiration en secondes
  const decoded = jwt.decode(accessToken) as any;
  const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);

  return {
    accessToken,
    refreshToken,
    expiresIn,
    tokenType: 'Bearer',
  };
};

// Vérification du token d'accès
export const verifyAccessToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, jwtConfig.secret, {
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience,
    }) as JwtPayload;
  } catch (error) {
    throw new Error('Token d\'accès invalide');
  }
};

// Vérification du refresh token
export const verifyRefreshToken = (token: string): { userId: string; tokenType: string } => {
  try {
    return jwt.verify(token, jwtConfig.refreshSecret, {
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience,
    }) as { userId: string; tokenType: string };
  } catch (error) {
    throw new Error('Refresh token invalide');
  }
};

// Décoder un token sans vérification (pour débug)
export const decodeToken = (token: string) => {
  return jwt.decode(token);
};

// Vérifier si un token est expiré
export const isTokenExpired = (token: string): boolean => {
  try {
    const decoded = jwt.decode(token) as any;
    if (!decoded || !decoded.exp) return true;
    
    return Date.now() >= decoded.exp * 1000;
  } catch {
    return true;
  }
};

// Extraire l'expiration d'un token
export const getTokenExpiration = (token: string): Date | null => {
  try {
    const decoded = jwt.decode(token) as any;
    if (!decoded || !decoded.exp) return null;
    
    return new Date(decoded.exp * 1000);
  } catch {
    return null;
  }
};