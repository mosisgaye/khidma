import { Request } from 'express';
import { JwtPayload } from '@/config/jwt';

// ============ TYPES API GÉNÉRAUX ============

// Réponse API standardisée
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  errors?: ValidationError[];
  meta?: ResponseMeta;
  timestamp: string;
}

// Métadonnées de réponse
export interface ResponseMeta {
  pagination?: Pagination;
  total?: number;
  page?: number;
  limit?: number;
  hasNext?: boolean;
  hasPrev?: boolean;
}

// Pagination
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Paramètres de pagination
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Erreur de validation
export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

// Filtre générique
export interface Filter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains' | 'startsWith' | 'endsWith';
  value: any;
}

// Paramètres de recherche
export interface SearchParams {
  q?: string;
  filters?: Filter[];
  pagination?: PaginationParams;
}

// ============ REQUEST AUGMENTÉ ============

// Extension de Request Express avec utilisateur authentifié
export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

// Request avec pagination
export interface PaginatedRequest extends Request {
  pagination: PaginationParams;
}

// Request avec recherche
export interface SearchRequest extends Request {
  search: SearchParams;
}

// ============ TYPES MÉTIER COMMUNS ============

// Adresse simplifiée
export interface AddressData {
  street: string;
  city: string;
  region: string;
  postalCode?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

// Coordonnées GPS
export interface Coordinates {
  latitude: number;
  longitude: number;
}

// Distance et durée
export interface DistanceInfo {
  distance: number; // en km
  duration: number; // en minutes
  route?: Coordinates[];
}

// Fichier uploadé
export interface UploadedFile {
  url: string;
  filename: string;
  originalName: string;
  size: number;
  mimeType: string;
}

// ============ TYPES DE STATUT ============

// Statut générique
export type Status = 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'SUSPENDED' | 'DELETED';

// Priorité
export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

// ============ TYPES D'ÉVÉNEMENTS ============

// Événement système
export interface SystemEvent {
  type: string;
  source: string;
  data: any;
  timestamp: Date;
  userId?: string;
}

// Log d'activité
export interface ActivityLog {
  action: string;
  entity: string;
  entityId: string;
  userId?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

// ============ TYPES DE NOTIFICATION ============

// Notification
export interface NotificationData {
  type: 'EMAIL' | 'SMS' | 'PUSH' | 'IN_APP';
  category: 'TRANSPORT' | 'BOUTIQUE' | 'ASSURANCE' | 'PAIEMENT' | 'SYSTEM';
  title: string;
  message: string;
  data?: any;
  priority?: Priority;
}

// ============ TYPES DE PAIEMENT ============

// Information de paiement
export interface PaymentInfo {
  amount: number;
  currency: string;
  method: string;
  reference?: string;
  description?: string;
}

// Résultat de paiement
export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  reference?: string;
  message?: string;
  data?: any;
}

// ============ TYPES D'ERREUR ============

// Erreur personnalisée
export interface AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  code?: string;
}

// Types d'erreur
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT = 'RATE_LIMIT',
  SERVER_ERROR = 'SERVER_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR'
}

// ============ HELPERS DE TYPE ============

// Type pour les clés d'un objet
export type KeyOf<T> = keyof T;

// Type pour les valeurs d'un objet
export type ValueOf<T> = T[keyof T];

// Type partiel avec des champs requis
export type PartialWith<T, K extends keyof T> = Partial<T> & Pick<T, K>;

// Type pour une création (sans id, createdAt, updatedAt)
export type CreateData<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>;

// Type pour une mise à jour (partial, sans id, createdAt)
export type UpdateData<T> = Partial<Omit<T, 'id' | 'createdAt'>>;

// ============ CONSTANTS ============

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_SORT_ORDER = 'desc';

// Codes de statut HTTP couramment utilisés
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
  RATE_LIMIT: 429,
  SERVER_ERROR: 500,
} as const;