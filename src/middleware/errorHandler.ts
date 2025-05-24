import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { ApiResponse, HTTP_STATUS, ErrorCode } from '@/types/api.types';
import { AuthErrorCode } from '@/types/auth.types';

// ============ CLASSES D'ERREUR PERSONNALISÉES ============

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public code?: string;

  constructor(message: string, statusCode: number = 500, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  public errors: Array<{ field: string; message: string; value?: any }>;

  constructor(errors: Array<{ field: string; message: string; value?: any }>) {
    super('Erreurs de validation', HTTP_STATUS.VALIDATION_ERROR, ErrorCode.VALIDATION_ERROR);
    this.errors = errors;
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentification requise', code: string = AuthErrorCode.INVALID_CREDENTIALS) {
    super(message, HTTP_STATUS.UNAUTHORIZED, code);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Permissions insuffisantes') {
    super(message, HTTP_STATUS.FORBIDDEN, ErrorCode.AUTHORIZATION_ERROR);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Ressource') {
    super(`${resource} non trouvé(e)`, HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Conflit avec les données existantes') {
    super(message, HTTP_STATUS.CONFLICT, ErrorCode.CONFLICT);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Trop de requêtes') {
    super(message, HTTP_STATUS.RATE_LIMIT, ErrorCode.RATE_LIMIT);
  }
}

// ============ GESTIONNAIRE D'ERREURS PRINCIPAL ============

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = HTTP_STATUS.SERVER_ERROR;
  let message = 'Erreur interne du serveur';
  let code = ErrorCode.SERVER_ERROR;
  let errors: any[] | undefined;

  // Logging de l'erreur
  console.error('❌ Erreur capturée:', {
    name: error.name,
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: (req as any).user?.userId
  });

  // ============ ERREURS PERSONNALISÉES ============
  if (error instanceof AppError) {
    statusCode = error.statusCode;
    message = error.message;
    code = error.code || ErrorCode.SERVER_ERROR;
    
    if (error instanceof ValidationError) {
      errors = error.errors;
    }
  }

  // ============ ERREURS ZOD (VALIDATION) ============
  else if (error instanceof ZodError) {
    statusCode = HTTP_STATUS.VALIDATION_ERROR;
    message = 'Erreurs de validation';
    code = ErrorCode.VALIDATION_ERROR;
    errors = error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      value: err.received
    }));
  }

  // ============ ERREURS PRISMA ============
  else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const prismaError = handlePrismaError(error);
    statusCode = prismaError.statusCode;
    message = prismaError.message;
    code = prismaError.code;
  }

  else if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    statusCode = HTTP_STATUS.SERVER_ERROR;
    message = 'Erreur de base de données inconnue';
    code = ErrorCode.DATABASE_ERROR;
  }

  else if (error instanceof Prisma.PrismaClientRustPanicError) {
    statusCode = HTTP_STATUS.SERVER_ERROR;
    message = 'Erreur critique de base de données';
    code = ErrorCode.DATABASE_ERROR;
  }

  else if (error instanceof Prisma.PrismaClientInitializationError) {
    statusCode = HTTP_STATUS.SERVER_ERROR;
    message = 'Erreur d\'initialisation de la base de données';
    code = ErrorCode.DATABASE_ERROR;
  }

  else if (error instanceof Prisma.PrismaClientValidationError) {
    statusCode = HTTP_STATUS.VALIDATION_ERROR;
    message = 'Erreur de validation Prisma';
    code = ErrorCode.VALIDATION_ERROR;
  }

  // ============ ERREURS JWT ============
  else if (error instanceof JsonWebTokenError) {
    statusCode = HTTP_STATUS.UNAUTHORIZED;
    message = 'Token invalide';
    code = AuthErrorCode.TOKEN_INVALID;
  }

  else if (error instanceof TokenExpiredError) {
    statusCode = HTTP_STATUS.UNAUTHORIZED;
    message = 'Token expiré';
    code = AuthErrorCode.TOKEN_EXPIRED;
  }

  // ============ ERREURS SYSTÈME ============
  else if (error.name === 'CastError') {
    statusCode = HTTP_STATUS.BAD_REQUEST;
    message = 'Format de données invalide';
    code = ErrorCode.VALIDATION_ERROR;
  }

  else if (error.name === 'SyntaxError') {
    statusCode = HTTP_STATUS.BAD_REQUEST;
    message = 'Syntaxe JSON invalide';
    code = ErrorCode.VALIDATION_ERROR;
  }

  // ============ RÉPONSE D'ERREUR ============
  const response: ApiResponse = {
    success: false,
    message,
    error: code,
    errors,
    timestamp: new Date().toISOString()
  };

  // Ne pas exposer les détails en production
  if (process.env.NODE_ENV === 'development') {
    (response as any).stack = error.stack;
    (response as any).details = {
      name: error.name,
      originalMessage: error.message
    };
  }

  res.status(statusCode).json(response);
};

// ============ GESTIONNAIRE ERREURS PRISMA ============

const handlePrismaError = (error: Prisma.PrismaClientKnownRequestError) => {
  switch (error.code) {
    case 'P2002':
      // Contrainte unique violée
      const field = extractFieldFromMeta(error.meta);
      return {
        statusCode: HTTP_STATUS.CONFLICT,
        message: `${field} déjà utilisé(e)`,
        code: ErrorCode.CONFLICT
      };

    case 'P2014':
      // Relation requise violée
      return {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: 'Relation requise manquante',
        code: ErrorCode.VALIDATION_ERROR
      };

    case 'P2003':
      // Contrainte de clé étrangère violée
      return {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: 'Référence invalide',
        code: ErrorCode.VALIDATION_ERROR
      };

    case 'P2025':
      // Enregistrement non trouvé
      return {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Ressource non trouvée',
        code: ErrorCode.NOT_FOUND
      };

    case 'P2016':
      // Erreur d'interprétation de requête
      return {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: 'Requête invalide',
        code: ErrorCode.VALIDATION_ERROR
      };

    default:
      return {
        statusCode: HTTP_STATUS.SERVER_ERROR,
        message: 'Erreur de base de données',
        code: ErrorCode.DATABASE_ERROR
      };
  }
};

// ============ UTILITAIRES ============

const extractFieldFromMeta = (meta: any): string => {
  if (meta?.target && Array.isArray(meta.target)) {
    return meta.target.join(', ');
  }
  return 'Champ';
};

// ============ GESTIONNAIRE 404 ============

export const notFoundHandler = (req: Request, res: Response): void => {
  const response: ApiResponse = {
    success: false,
    message: `Route ${req.originalUrl} non trouvée`,
    error: ErrorCode.NOT_FOUND,
    timestamp: new Date().toISOString()
  };

  res.status(HTTP_STATUS.NOT_FOUND).json(response);
};

// ============ GESTIONNAIRE ERREURS ASYNC ============

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// ============ GESTIONNAIRE ERREURS NON CAPTURÉES ============

export const handleUncaughtErrors = (): void => {
  // Erreurs non capturées
  process.on('uncaughtException', (error: Error) => {
    console.error('💥 Erreur non capturée:', error);
    console.error('🔄 Arrêt du serveur...');
    process.exit(1);
  });

  // Promesses rejetées non gérées
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    console.error('💥 Promesse rejetée non gérée:', reason);
    console.error('📍 Promesse:', promise);
    console.error('🔄 Arrêt du serveur...');
    process.exit(1);
  });

  // Signaux d'arrêt gracieux
  process.on('SIGTERM', () => {
    console.log('🔄 Signal SIGTERM reçu, arrêt gracieux...');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('🔄 Signal SIGINT reçu, arrêt gracieux...');
    process.exit(0);
  });
};

// ============ FONCTIONS HELPER ============

export const throwNotFound = (resource: string = 'Ressource'): never => {
  throw new NotFoundError(resource);
};

export const throwValidation = (field: string, message: string, value?: any): never => {
  throw new ValidationError([{ field, message, value }]);
};

export const throwUnauthorized = (message?: string, code?: string): never => {
  throw new AuthenticationError(message, code);
};

export const throwForbidden = (message?: string): never => {
  throw new AuthorizationError(message);
};

export const throwConflict = (message?: string): never => {
  throw new ConflictError(message);
};