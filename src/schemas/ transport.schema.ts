import { z } from 'zod';
import { VehicleType, VehicleStatus, GoodsType, TransportOrderStatus, QuoteStatus } from '@prisma/client';

// ============ SCHÉMAS DE BASE ============

// Coordonnées GPS
export const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180)
});

// Plaque d'immatriculation sénégalaise
export const plateNumberSchema = z
  .string()
  .regex(/^[A-Z]{2}-[0-9]{4}-[A-Z]{1,2}$/, 'Format de plaque invalide (ex: DK-1234-A)');

// Numéro de châssis
export const chassisNumberSchema = z
  .string()
  .regex(/^[A-HJ-NPR-Z0-9]{17}$/, 'Numéro de châssis invalide (17 caractères)')
  .optional();

// ============ SCHÉMAS VÉHICULES ============

export const createVehicleSchema = z.object({
  type: z.nativeEnum(VehicleType, {
    errorMap: () => ({ message: 'Type de véhicule invalide' })
  }),
  brand: z.string()
    .min(2, 'Marque trop courte')
    .max(50, 'Marque trop longue'),
  model: z.string()
    .min(2, 'Modèle trop court')
    .max(50, 'Modèle trop long'),
  year: z.number()
    .int('Année doit être un entier')
    .min(1980, 'Année trop ancienne')
    .max(new Date().getFullYear() + 1, 'Année trop récente'),
  plateNumber: plateNumberSchema,
  chassisNumber: chassisNumberSchema,
  capacity: z.number()
    .positive('Capacité doit être positive')
    .max(50000, 'Capacité maximale 50 tonnes'),
  volume: z.number()
    .positive('Volume doit être positif')
    .max(300, 'Volume maximal 300 m³')
    .optional(),
  fuelType: z.enum(['DIESEL', 'ESSENCE', 'HYBRID', 'ELECTRIC'], {
    errorMap: () => ({ message: 'Type de carburant invalide' })
  }).default('DIESEL'),
  features: z.array(z.string())
    .default([]),
  insurance: z.string()
    .min(5, 'Numéro d\'assurance trop court')
    .max(50, 'Numéro d\'assurance trop long')
    .optional(),
  insuranceExpiry: z.coerce.date()
    .min(new Date(), 'Date d\'expiration d\'assurance passée')
    .optional(),
  dailyRate: z.number()
    .positive('Tarif journalier doit être positif')
    .max(1000000, 'Tarif journalier trop élevé')
    .optional(),
  kmRate: z.number()
    .positive('Tarif kilométrique doit être positif')
    .max(10000, 'Tarif kilométrique trop élevé')
    .optional()
});

export const updateVehicleSchema = createVehicleSchema.partial();

export const vehicleStatusSchema = z.object({
  status: z.nativeEnum(VehicleStatus, {
    errorMap: () => ({ message: 'Statut de véhicule invalide' })
  })
});

export const vehicleFiltersSchema = z.object({
  type: z.nativeEnum(VehicleType).optional(),
  status: z.nativeEnum(VehicleStatus).optional(),
  minCapacity: z.number().positive().optional(),
  maxCapacity: z.number().positive().optional(),
  region: z.string().min(1).optional(),
  available: z.boolean().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10)
});

// ============ SCHÉMAS COMMANDES TRANSPORT ============

export const createTransportOrderSchema = z.object({
  // Adresses
  departureAddressId: z.string().cuid('ID adresse de départ invalide'),
  destinationAddressId: z.string().cuid('ID adresse de destination invalide'),
  
  // Planification
  departureDate: z.coerce.date()
    .min(new Date(), 'Date de départ ne peut pas être dans le passé'),
  departureTime: z.string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Format d\'heure invalide (HH:MM)')
    .optional(),
  deliveryDate: z.coerce.date().optional(),
  deliveryTime: z.string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Format d\'heure invalide (HH:MM)')
    .optional(),
  
  // Marchandise
  goodsType: z.nativeEnum(GoodsType, {
    errorMap: () => ({ message: 'Type de marchandise invalide' })
  }),
  goodsDescription: z.string()
    .min(10, 'Description trop courte (minimum 10 caractères)')
    .max(1000, 'Description trop longue (maximum 1000 caractères)'),
  weight: z.number()
    .positive('Poids doit être positif')
    .max(50000, 'Poids maximal 50 tonnes (50 000 kg)'),
  volume: z.number()
    .positive('Volume doit être positif')
    .max(300, 'Volume maximal 300 m³')
    .optional(),
  quantity: z.number()
    .int('Quantité doit être un entier')
    .positive('Quantité doit être positive')
    .optional(),
  packagingType: z.string()
    .max(100, 'Type d\'emballage trop long')
    .optional(),
  specialRequirements: z.array(z.string())
    .default([]),
  declaredValue: z.number()
    .positive('Valeur déclarée doit être positive')
    .max(100000000, 'Valeur déclarée trop élevée')
    .optional(),
  
  // Préférences
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT'], {
    errorMap: () => ({ message: 'Priorité invalide' })
  }).default('NORMAL'),
  notes: z.string()
    .max(500, 'Notes trop longues (maximum 500 caractères)')
    .optional(),
  
  // Contacts
  departureContact: z.string()
    .max(100, 'Contact départ trop long')
    .optional(),
  destinationContact: z.string()
    .max(100, 'Contact destination trop long')
    .optional(),
  departureInstructions: z.string()
    .max(500, 'Instructions départ trop longues')
    .optional(),
  deliveryInstructions: z.string()
    .max(500, 'Instructions livraison trop longues')
    .optional()
}).refine(data => {
  // Si date de livraison fournie, elle doit être après la date de départ
  if (data.deliveryDate && data.departureDate) {
    return data.deliveryDate >= data.departureDate;
  }
  return true;
}, {
  message: 'Date de livraison doit être après la date de départ',
  path: ['deliveryDate']
});

export const updateTransportOrderSchema = createTransportOrderSchema.partial();

export const assignTransportOrderSchema = z.object({
  transporteurId: z.string().cuid('ID transporteur invalide'),
  vehicleId: z.string().cuid('ID véhicule invalide'),
  estimatedDelivery: z.coerce.date()
    .min(new Date(), 'Date de livraison estimée ne peut pas être dans le passé')
    .optional()
});

export const transportSearchSchema = z.object({
  // Géographique
  departureRegion: z.string().min(1).optional(),
  departureCity: z.string().min(1).optional(),
  destinationRegion: z.string().min(1).optional(),
  destinationCity: z.string().min(1).optional(),
  maxDistance: z.number().positive().max(5000).optional(),
  
  // Marchandise
  goodsType: z.nativeEnum(GoodsType).optional(),
  minWeight: z.number().positive().optional(),
  maxWeight: z.number().positive().optional(),
  minVolume: z.number().positive().optional(),
  maxVolume: z.number().positive().optional(),
  
  // Véhicule
  vehicleType: z.nativeEnum(VehicleType).optional(),
  minCapacity: z.number().positive().optional(),
  maxCapacity: z.number().positive().optional(),
  
  // Dates
  departureDateFrom: z.coerce.date().optional(),
  departureDateTo: z.coerce.date().optional(),
  deliveryDateFrom: z.coerce.date().optional(),
  deliveryDateTo: z.coerce.date().optional(),
  
  // Autres
  status: z.array(z.nativeEnum(TransportOrderStatus)).optional(),
  priority: z.array(z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT'])).optional(),
  hasSpecialRequirements: z.boolean().optional(),
  maxPrice: z.number().positive().optional(),
  
  // Tri et pagination
  sortBy: z.enum(['date', 'price', 'distance', 'rating']).default('date'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10)
});

// ============ SCHÉMAS DEVIS ============

export const quoteCalculationSchema = z.object({
  basePrice: z.number().min(0, 'Prix de base ne peut pas être négatif'),
  distancePrice: z.number().min(0, 'Prix distance ne peut pas être négatif'),
  weightPrice: z.number().min(0, 'Prix poids ne peut pas être négatif'),
  volumePrice: z.number().min(0, 'Prix volume ne peut pas être négatif').optional(),
  fuelSurcharge: z.number().min(0, 'Surcharge carburant ne peut pas être négative'),
  tollFees: z.number().min(0, 'Frais de péage ne peuvent pas être négatifs'),
  handlingFees: z.number().min(0, 'Frais de manutention ne peuvent pas être négatifs'),
  insuranceFees: z.number().min(0, 'Frais d\'assurance ne peuvent pas être négatifs'),
  otherFees: z.number().min(0, 'Autres frais ne peuvent pas être négatifs'),
  subtotal: z.number().min(0, 'Sous-total ne peut pas être négatif'),
  taxes: z.number().min(0, 'Taxes ne peuvent pas être négatives'),
  totalPrice: z.number().positive('Prix total doit être positif')
});

export const createQuoteSchema = z.object({
  transportOrderId: z.string().cuid('ID commande invalide'),
  vehicleId: z.string().cuid('ID véhicule invalide').optional(),
  calculation: quoteCalculationSchema,
  validUntil: z.coerce.date()
    .min(new Date(), 'Date de validité ne peut pas être dans le passé'),
  paymentTerms: z.string()
    .max(200, 'Conditions de paiement trop longues')
    .optional(),
  deliveryTerms: z.string()
    .max(200, 'Conditions de livraison trop longues')
    .optional(),
  conditions: z.string()
    .max(1000, 'Conditions générales trop longues')
    .optional(),
  notes: z.string()
    .max(500, 'Notes trop longues')
    .optional()
});

export const updateQuoteSchema = createQuoteSchema.partial();

export const quoteActionSchema = z.object({
  action: z.enum(['send', 'accept', 'reject'], {
    errorMap: () => ({ message: 'Action invalide' })
  }),
  reason: z.string()
    .max(500, 'Raison trop longue')
    .optional()
});

// ============ SCHÉMAS GÉOLOCALISATION ============

export const calculateDistanceSchema = z.object({
  departure: coordinatesSchema,
  destination: coordinatesSchema,
  waypoints: z.array(coordinatesSchema).optional(),
  avoidTolls: z.boolean().default(false),
  avoidHighways: z.boolean().default(false)
});

export const trackingEventSchema = z.object({
  transportOrderId: z.string().cuid('ID commande invalide'),
  eventType: z.enum(['PICKUP', 'TRANSIT', 'DELIVERY', 'ISSUE', 'DELAY'], {
    errorMap: () => ({ message: 'Type d\'événement invalide' })
  }),
  location: z.string()
    .min(2, 'Localisation trop courte')
    .max(200, 'Localisation trop longue'),
  address: z.string()
    .max(300, 'Adresse trop longue')
    .optional(),
  coordinates: coordinatesSchema.optional(),
  description: z.string()
    .min(5, 'Description trop courte')
    .max(1000, 'Description trop longue'),
  images: z.array(z.string().url('URL d\'image invalide'))
    .max(10, 'Maximum 10 images')
    .default([]),
  signature: z.string()
    .max(10000, 'Signature trop longue')
    .optional(),
  contactPerson: z.string()
    .max(100, 'Nom de contact trop long')
    .optional(),
  isPublic: z.boolean().default(true)
});

// ============ SCHÉMAS DISPONIBILITÉS ============

export const availabilitySchema = z.object({
  transporteurId: z.string().cuid('ID transporteur invalide').optional(),
  vehicleId: z.string().cuid('ID véhicule invalide').optional(),
  type: z.enum(['DISPONIBLE', 'OCCUPE', 'MAINTENANCE', 'REPOS', 'CONGE'], {
    errorMap: () => ({ message: 'Type de disponibilité invalide' })
  }),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  startTime: z.string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Format d\'heure invalide (HH:MM)')
    .optional(),
  endTime: z.string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Format d\'heure invalide (HH:MM)')
    .optional(),
  isRecurring: z.boolean().default(false),
  recurrencePattern: z.enum(['DAILY', 'WEEKLY', 'MONTHLY'], {
    errorMap: () => ({ message: 'Modèle de récurrence invalide' })
  }).optional(),
  notes: z.string()
    .max(500, 'Notes trop longues')
    .optional()
}).refine(data => {
  return data.endDate >= data.startDate;
}, {
  message: 'Date de fin doit être après la date de début',
  path: ['endDate']
}).refine(data => {
  // Au moins un ID doit être fourni
  return data.transporteurId || data.vehicleId;
}, {
  message: 'ID transporteur ou véhicule requis',
  path: ['transporteurId']
});

// ============ SCHÉMAS ÉVALUATIONS ============

export const reviewSchema = z.object({
  transportOrderId: z.string().cuid('ID commande invalide'),
  overallRating: z.number()
    .int('Note générale doit être un entier')
    .min(1, 'Note minimale: 1')
    .max(5, 'Note maximale: 5'),
  punctualityRating: z.number()
    .int('Note ponctualité doit être un entier')
    .min(1, 'Note minimale: 1')
    .max(5, 'Note maximale: 5')
    .optional(),
  communicationRating: z.number()
    .int('Note communication doit être un entier')
    .min(1, 'Note minimale: 1')
    .max(5, 'Note maximale: 5')
    .optional(),
  vehicleConditionRating: z.number()
    .int('Note état véhicule doit être un entier')
    .min(1, 'Note minimale: 1')
    .max(5, 'Note maximale: 5')
    .optional(),
  professionalismRating: z.number()
    .int('Note professionnalisme doit être un entier')
    .min(1, 'Note minimale: 1')
    .max(5, 'Note maximale: 5')
    .optional(),
  comment: z.string()
    .min(10, 'Commentaire trop court (minimum 10 caractères)')
    .max(1000, 'Commentaire trop long (maximum 1000 caractères)')
    .optional(),
  pros: z.string()
    .max(500, 'Points positifs trop longs')
    .optional(),
  cons: z.string()
    .max(500, 'Points négatifs trop longs')
    .optional(),
  isPublic: z.boolean().default(true)
});

// ============ SCHÉMAS RÈGLES TARIFAIRES ============

export const pricingRuleSchema = z.object({
  name: z.string()
    .min(3, 'Nom trop court')
    .max(100, 'Nom trop long'),
  vehicleType: z.nativeEnum(VehicleType).optional(),
  goodsType: z.nativeEnum(GoodsType).optional(),
  minWeight: z.number().positive('Poids minimum doit être positif').optional(),
  maxWeight: z.number().positive('Poids maximum doit être positif').optional(),
  minDistance: z.number().positive('Distance minimum doit être positive').optional(),
  maxDistance: z.number().positive('Distance maximum doit être positive').optional(),
  basePrice: z.number().min(0, 'Prix de base ne peut pas être négatif'),
  pricePerKm: z.number().min(0, 'Prix par km ne peut pas être négatif').optional(),
  pricePerTon: z.number().min(0, 'Prix par tonne ne peut pas être négatif').optional(),
  pricePerHour: z.number().min(0, 'Prix par heure ne peut pas être négatif').optional(),
  minimumCharge: z.number().min(0, 'Charge minimum ne peut pas être négative').optional(),
  validFrom: z.coerce.date(),
  validUntil: z.coerce.date().optional()
}).refine(data => {
  if (data.minWeight && data.maxWeight) {
    return data.maxWeight >= data.minWeight;
  }
  return true;
}, {
  message: 'Poids maximum doit être supérieur au poids minimum',
  path: ['maxWeight']
}).refine(data => {
  if (data.minDistance && data.maxDistance) {
    return data.maxDistance >= data.minDistance;
  }
  return true;
}, {
  message: 'Distance maximum doit être supérieure à la distance minimum',
  path: ['maxDistance']
}).refine(data => {
  if (data.validUntil) {
    return data.validUntil >= data.validFrom;
  }
  return true;
}, {
  message: 'Date de fin de validité doit être après la date de début',
  path: ['validUntil']
});

// ============ TYPES INFÉRÉS ============

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
export type VehicleFiltersInput = z.infer<typeof vehicleFiltersSchema>;
export type CreateTransportOrderInput = z.infer<typeof createTransportOrderSchema>;
export type UpdateTransportOrderInput = z.infer<typeof updateTransportOrderSchema>;
export type TransportSearchInput = z.infer<typeof transportSearchSchema>;
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type QuoteActionInput = z.infer<typeof quoteActionSchema>;
export type CalculateDistanceInput = z.infer<typeof calculateDistanceSchema>;
export type TrackingEventInput = z.infer<typeof trackingEventSchema>;
export type AvailabilityInput = z.infer<typeof availabilitySchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
export type PricingRuleInput = z.infer<typeof pricingRuleSchema>;