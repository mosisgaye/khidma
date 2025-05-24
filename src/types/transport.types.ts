import { VehicleType, VehicleStatus, TransportOrderStatus, GoodsType, QuoteStatus } from '@prisma/client';

// ============ TYPES VÉHICULES ============

export interface VehicleData {
  type: VehicleType;
  brand: string;
  model: string;
  year: number;
  plateNumber: string;
  chassisNumber?: string;
  capacity: number; // en tonnes
  volume?: number; // en m3
  fuelType: 'DIESEL' | 'ESSENCE' | 'HYBRID' | 'ELECTRIC';
  features: string[]; // GPS, Bâche, Hayon, etc.
  insurance?: string;
  insuranceExpiry?: Date;
  dailyRate?: number;
  kmRate?: number;
}

export interface VehicleResponse extends VehicleData {
  id: string;
  transporteurId: string;
  status: VehicleStatus;
  images: string[];
  lastMaintenance?: Date;
  nextMaintenance?: Date;
  mileage?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface VehicleFilters {
  type?: VehicleType;
  status?: VehicleStatus;
  minCapacity?: number;
  maxCapacity?: number;
  region?: string;
  available?: boolean;
}

// ============ TYPES COMMANDES TRANSPORT ============

export interface CreateTransportOrderData {
  // Adresses
  departureAddressId: string;
  destinationAddressId: string;
  
  // Planification
  departureDate: Date;
  departureTime?: string;
  deliveryDate?: Date;
  deliveryTime?: string;
  
  // Marchandise
  goodsType: GoodsType;
  goodsDescription: string;
  weight: number; // en kg
  volume?: number; // en m3
  quantity?: number;
  packagingType?: string;
  specialRequirements: string[];
  declaredValue?: number;
  
  // Préférences
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  notes?: string;
}

export interface TransportOrderResponse extends CreateTransportOrderData {
  id: string;
  orderNumber: string;
  expediteurId: string;
  transporteurId?: string;
  vehicleId?: string;
  status: TransportOrderStatus;
  
  // Calculs
  estimatedDistance?: number;
  estimatedDuration?: number;
  basePrice?: number;
  totalPrice?: number;
  
  // Adresses détaillées
  departureAddress: AddressInfo;
  destinationAddress: AddressInfo;
  
  // Contacts
  departureContact?: string;
  destinationContact?: string;
  
  // Métadonnées
  createdAt: Date;
  updatedAt: Date;
  assignedAt?: Date;
  completedAt?: Date;
}

export interface AddressInfo {
  id: string;
  street: string;
  city: string;
  region: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
}

// ============ TYPES RECHERCHE ============

export interface TransportSearchFilters {
  // Géographique
  departureRegion?: string;
  departureCity?: string;
  destinationRegion?: string;
  destinationCity?: string;
  maxDistance?: number;
  
  // Marchandise
  goodsType?: GoodsType;
  minWeight?: number;
  maxWeight?: number;
  minVolume?: number;
  maxVolume?: number;
  
  // Véhicule
  vehicleType?: VehicleType;
  minCapacity?: number;
  maxCapacity?: number;
  
  // Dates
  departureDateFrom?: Date;
  departureDateTo?: Date;
  deliveryDateFrom?: Date;
  deliveryDateTo?: Date;
  
  // Autres
  status?: TransportOrderStatus[];
  priority?: string[];
  hasSpecialRequirements?: boolean;
  maxPrice?: number;
  
  // Tri
  sortBy?: 'date' | 'price' | 'distance' | 'rating';
  sortOrder?: 'asc' | 'desc';
}

// ============ TYPES DEVIS ============

export interface QuoteCalculation {
  basePrice: number;
  distancePrice: number;
  weightPrice: number;
  volumePrice?: number;
  fuelSurcharge: number;
  tollFees: number;
  handlingFees: number;
  insuranceFees: number;
  otherFees: number;
  subtotal: number;
  taxes: number;
  totalPrice: number;
}

export interface CreateQuoteData {
  transportOrderId: string;
  vehicleId?: string;
  calculation: QuoteCalculation;
  validUntil: Date;
  paymentTerms?: string;
  deliveryTerms?: string;
  conditions?: string;
  notes?: string;
}

export interface QuoteResponse extends CreateQuoteData {
  id: string;
  quoteNumber: string;
  transporteurId: string;
  status: QuoteStatus;
  sentAt?: Date;
  viewedAt?: Date;
  respondedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ============ TYPES GÉOLOCALISATION ============

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface DistanceMatrix {
  departure: Coordinates;
  destination: Coordinates;
  distance: number; // en km
  duration: number; // en minutes
  route?: Coordinates[];
}

export interface TrackingEvent {
  id: string;
  transportOrderId: string;
  eventType: 'PICKUP' | 'TRANSIT' | 'DELIVERY' | 'ISSUE' | 'DELAY';
  location: string;
  address?: string;
  coordinates?: Coordinates;
  description: string;
  images: string[];
  signature?: string;
  contactPerson?: string;
  isPublic: boolean;
  timestamp: Date;
}

// ============ TYPES DISPONIBILITÉS ============

export interface AvailabilityData {
  transporteurId?: string;
  vehicleId?: string;
  type: 'DISPONIBLE' | 'OCCUPE' | 'MAINTENANCE' | 'REPOS' | 'CONGE';
  startDate: Date;
  endDate: Date;
  startTime?: string;
  endTime?: string;
  isRecurring: boolean;
  recurrencePattern?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  notes?: string;
}

export interface AvailabilityResponse extends AvailabilityData {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============ TYPES ÉVALUATIONS ============

export interface ReviewData {
  transportOrderId: string;
  overallRating: number; // 1-5
  punctualityRating?: number;
  communicationRating?: number;
  vehicleConditionRating?: number;
  professionalismRating?: number;
  comment?: string;
  pros?: string;
  cons?: string;
  isPublic: boolean;
}

export interface ReviewResponse extends ReviewData {
  id: string;
  transporteurId: string;
  reviewerType: 'EXPEDITEUR' | 'TRANSPORTEUR';
  isVerified: boolean;
  helpful: number;
  notHelpful: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============ TYPES RÈGLES TARIFAIRES ============

export interface PricingRuleData {
  name: string;
  vehicleType?: VehicleType;
  goodsType?: GoodsType;
  minWeight?: number;
  maxWeight?: number;
  minDistance?: number;
  maxDistance?: number;
  basePrice: number;
  pricePerKm?: number;
  pricePerTon?: number;
  pricePerHour?: number;
  minimumCharge?: number;
  validFrom: Date;
  validUntil?: Date;
}

export interface PricingRuleResponse extends PricingRuleData {
  id: string;
  transporteurId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============ TYPES UTILITAIRES ============

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface TransportStats {
  totalOrders: number;
  completedOrders: number;
  pendingOrders: number;
  cancelledOrders: number;
  totalRevenue: number;
  averageRating: number;
  totalDistance: number;
  activeVehicles: number;
}

// ============ CONSTANTES ============

export const VEHICLE_CAPACITIES = {
  CAMION_3T: { weight: 3000, volume: 15 },
  CAMION_5T: { weight: 5000, volume: 25 },
  CAMION_10T: { weight: 10000, volume: 50 },
  CAMION_20T: { weight: 20000, volume: 100 },
  CAMION_35T: { weight: 35000, volume: 175 },
  REMORQUE: { weight: 40000, volume: 200 },
  SEMI_REMORQUE: { weight: 44000, volume: 220 },
  FOURGON: { weight: 2000, volume: 12 },
  BENNE: { weight: 15000, volume: 30 },
  CITERNE: { weight: 25000, volume: 25000 } // Pour liquides
} as const;

export const DEFAULT_PRICING = {
  BASE_PRICE: 25000, // XOF
  PRICE_PER_KM: 150, // XOF/km
  PRICE_PER_TON: 5000, // XOF/tonne
  FUEL_SURCHARGE_RATE: 0.1, // 10%
  INSURANCE_RATE: 0.02, // 2%
  TAX_RATE: 0.18 // 18% TVA Sénégal
} as const;