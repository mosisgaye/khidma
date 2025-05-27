import { VehicleType, GoodsType } from '@prisma/client';
import { 
  QuoteCalculation,
  PricingRuleData,
  DistanceMatrix,
  DEFAULT_PRICING,
  VEHICLE_CAPACITIES
} from '@/types/transport.types';
import { NotFoundError, ValidationError } from '@/middleware/errorHandler';
import prisma from '@/config/database';
import { geolocationService } from './geolocation.service';

// ============ SERVICE CALCUL DE PRIX INTELLIGENT ============

export class PricingService {

  // ============ CALCUL INTELLIGENT DES PRIX ============

  /**
   * Calculer le prix d'une commande de transport avec règles intelligentes
   */
  async calculateTransportPrice(data: {
    transporteurId?: string;
    vehicleType: VehicleType;
    goodsType: GoodsType;
    weight: number; // en kg
    volume?: number; // en m3
    distance: number; // en km
    departureDate: Date;
    isUrgent?: boolean;
    specialRequirements: string[];
    declaredValue?: number;
  }): Promise<QuoteCalculation> {
    
    // 1. Récupérer les règles de prix du transporteur si spécifié
    const pricingRules = data.transporteurId 
      ? await this.getTransporteurPricingRules(data.transporteurId, data.vehicleType, data.goodsType)
      : null;

    // 2. Calculer le prix de base
    const basePrice = this.calculateBasePrice(pricingRules, data.vehicleType, data.goodsType);

    // 3. Calculer le prix basé sur la distance
    const distancePrice = this.calculateDistancePrice(pricingRules, data.distance, data.vehicleType);

    // 4. Calculer le prix basé sur le poids
    const weightPrice = this.calculateWeightPrice(pricingRules, data.weight, data.vehicleType);

    // 5. Calculer le prix basé sur le volume (si applicable)
    const volumePrice = data.volume 
      ? this.calculateVolumePrice(data.volume, data.vehicleType)
      : 0;

    // 6. Calculer les frais additionnels
    const fuelSurcharge = this.calculateFuelSurcharge(basePrice + distancePrice + weightPrice);
    const tollFees = this.calculateTollFees(data.distance);
    const handlingFees = this.calculateHandlingFees(data.specialRequirements, data.goodsType);
    const insuranceFees = this.calculateInsuranceFees(data.declaredValue);
    const otherFees = this.calculateOtherFees(data.isUrgent, data.departureDate);

    // 7. Calculer les sous-totaux
    const subtotal = basePrice + distancePrice + weightPrice + volumePrice + 
                    fuelSurcharge + tollFees + handlingFees + insuranceFees + otherFees;

    // 8. Calculer les taxes (TVA 18% au Sénégal)
    const taxes = subtotal * DEFAULT_PRICING.TAX_RATE;

    // 9. Prix total
    const totalPrice = subtotal + taxes;

    return {
      basePrice: Math.round(basePrice),
      distancePrice: Math.round(distancePrice),
      weightPrice: Math.round(weightPrice),
      volumePrice: Math.round(volumePrice),
      fuelSurcharge: Math.round(fuelSurcharge),
      tollFees: Math.round(tollFees),
      handlingFees: Math.round(handlingFees),
      insuranceFees: Math.round(insuranceFees),
      otherFees: Math.round(otherFees),
      subtotal: Math.round(subtotal),
      taxes: Math.round(taxes),
      totalPrice: Math.round(totalPrice)
    };
  }

  /**
   * Calculer un devis pour plusieurs transporteurs
   */
  async calculateQuotesForOrder(orderId: string): Promise<{
    transporteurId: string;
    quote: QuoteCalculation;
    transporteur: any;
    vehicle: any;
  }[]> {
    // Récupérer la commande
    const order = await prisma.transportOrder.findUnique({
      where: { id: orderId },
      include: {
        departureAddress: true,
        destinationAddress: true
      }
    });

    if (!order) {
      throw new NotFoundError('Commande de transport');
    }

    // Calculer la distance si pas déjà fait
    let distance = order.estimatedDistance;
    if (!distance && order.departureAddress.latitude && order.destinationAddress.latitude) {
      const distanceMatrix = await geolocationService.calculateDistanceBetweenAddresses(
        order.departureAddressId,
        order.destinationAddressId
      );
      distance = distanceMatrix?.distance || 0;
    }

    if (!distance) {
      throw new ValidationError([{
        field: 'distance',
        message: 'Impossible de calculer la distance pour cette commande'
      }]);
    }

    // Trouver les transporteurs avec véhicules adaptés
    const suitableTransporteurs = await this.findSuitableTransporteurs({
      goodsType: order.goodsType,
      weight: order.weight,
      volume: order.volume,
      departureRegion: order.departureAddress.region,
      destinationRegion: order.destinationAddress.region
    });

    // Calculer les devis pour chaque transporteur
    const quotes = await Promise.all(
      suitableTransporteurs.map(async (transporteur) => {
        const quote = await this.calculateTransportPrice({
          transporteurId: transporteur.id,
          vehicleType: transporteur.bestVehicle.type,
          goodsType: order.goodsType,
          weight: order.weight,
          volume: order.volume,
          distance,
          departureDate: order.departureDate,
          isUrgent: order.priority === 'URGENT',
          specialRequirements: order.specialRequirements,
          declaredValue: order.declaredValue
        });

        return {
          transporteurId: transporteur.id,
          quote,
          transporteur: {
            id: transporteur.id,
            companyName: transporteur.companyName,
            rating: transporteur.rating,
            completionRate: transporteur.completionRate,
            totalRides: transporteur.totalRides,
            user: {
              firstName: transporteur.user.firstName,
              lastName: transporteur.user.lastName
            }
          },
          vehicle: transporteur.bestVehicle
        };
      })
    );

    // Trier par prix croissant
    return quotes.sort((a, b) => a.quote.totalPrice - b.quote.totalPrice);
  }

  // ============ CALCULS SPÉCIALISÉS ============

  /**
   * Calculer le prix de base selon les règles
   */
  private calculateBasePrice(
    pricingRules: any,
    vehicleType: VehicleType,
    goodsType: GoodsType
  ): number {
    if (pricingRules?.basePrice) {
      return pricingRules.basePrice;
    }

    // Prix de base par défaut selon le type de véhicule
    const basePrices: Record<VehicleType, number> = {
      CAMION_3T: 25000,
      CAMION_5T: 35000,
      CAMION_10T: 45000,
      CAMION_20T: 65000,
      CAMION_35T: 85000,
      REMORQUE: 95000,
      SEMI_REMORQUE: 100000,
      FOURGON: 20000,
      BENNE: 40000,
      CITERNE: 55000
    };

    let basePrice = basePrices[vehicleType] || DEFAULT_PRICING.BASE_PRICE;

    // Majoration selon le type de marchandise
    const goodsMultipliers: Record<string, number> = {
      PRODUITS_DANGEREUX: 1.8,
      LIQUIDES: 1.4,
      PRODUITS_CHIMIQUES: 1.6,
      VEHICULES: 1.3,
      BETAIL: 1.5,
      PRODUITS_ALIMENTAIRES: 1.2,
      MATERIAUX_CONSTRUCTION: 1.1,
      EQUIPEMENTS: 1.25,
      MOBILIER: 1.15,
      TEXTILES: 1.05
    };

    if (goodsMultipliers[goodsType]) {
      basePrice *= goodsMultipliers[goodsType];
    }

    return basePrice;
  }

  /**
   * Calculer le prix basé sur la distance
   */
  private calculateDistancePrice(
    pricingRules: any,
    distance: number,
    vehicleType: VehicleType
  ): number {
    const pricePerKm = pricingRules?.pricePerKm || DEFAULT_PRICING.PRICE_PER_KM;

    // Tarifs dégressifs par tranche de distance
    let finalPricePerKm = pricePerKm;

    if (distance > 500) {
      finalPricePerKm *= 0.8; // -20% au-delà de 500km
    } else if (distance > 200) {
      finalPricePerKm *= 0.9; // -10% au-delà de 200km
    }

    // Majoration pour véhicules lourds
    const heavyVehicleMultiplier: Record<string, number> = {
      CAMION_35T: 1.3,
      REMORQUE: 1.4,
      SEMI_REMORQUE: 1.5
    };

    if (heavyVehicleMultiplier[vehicleType]) {
      finalPricePerKm *= heavyVehicleMultiplier[vehicleType];
    }

    return distance * finalPricePerKm;
  }

  /**
   * Calculer le prix basé sur le poids
   */
  private calculateWeightPrice(
    pricingRules: any,
    weight: number, // en kg
    vehicleType: VehicleType
  ): number {
    const weightInTons = weight / 1000;
    const pricePerTon = pricingRules?.pricePerTon || DEFAULT_PRICING.PRICE_PER_TON;

    // Seuils de poids avec tarifs dégressifs
    let finalPricePerTon = pricePerTon;

    if (weightInTons > 20) {
      finalPricePerTon *= 0.85; // -15% au-delà de 20T
    } else if (weightInTons > 10) {
      finalPricePerTon *= 0.92; // -8% au-delà de 10T
    } else if (weightInTons > 5) {
      finalPricePerTon *= 0.95; // -5% au-delà de 5T
    }

    return weightInTons * finalPricePerTon;
  }

  /**
   * Calculer le prix basé sur le volume
   */
  private calculateVolumePrice(volume: number, vehicleType: VehicleType): number {
    const vehicleCapacity = VEHICLE_CAPACITIES[vehicleType];
    if (!vehicleCapacity) return 0;

    // Prix par m3 selon la capacité du véhicule
    const pricePerM3 = vehicleCapacity.volume > 100 ? 800 : 1200;
    
    // Ratio d'occupation du véhicule
    const occupancyRatio = volume / vehicleCapacity.volume;
    
    // Majoration si le véhicule est bien rempli
    let multiplier = 1;
    if (occupancyRatio > 0.8) {
      multiplier = 1.2;
    } else if (occupancyRatio > 0.6) {
      multiplier = 1.1;
    }

    return volume * pricePerM3 * multiplier;
  }

  /**
   * Calculer les frais de carburant
   */
  private calculateFuelSurcharge(baseTotal: number): number {
    return baseTotal * DEFAULT_PRICING.FUEL_SURCHARGE_RATE;
  }

  /**
   * Calculer les frais de péage
   */
  private calculateTollFees(distance: number): number {
    // Estimation: 25 XOF/km pour les grands axes
    const tollRate = 25;
    
    // Péages principalement sur les longues distances
    if (distance > 100) {
      return distance * tollRate * 0.6; // 60% de la distance en péage
    } else if (distance > 50) {
      return distance * tollRate * 0.3; // 30% de la distance en péage
    }
    
    return 0;
  }

  /**
   * Calculer les frais de manutention spéciaux
   */
  private calculateHandlingFees(specialRequirements: string[], goodsType: GoodsType): number {
    let handlingFees = 0;

    // Frais par exigence spéciale
    const requirementFees: Record<string, number> = {
      'Fragile': 5000,
      'Réfrigéré': 15000,
      'Urgent': 10000,
      'Sécurisé': 8000,
      'Manutention délicate': 7000,
      'Chargement/Déchargement': 5000,
      'Emballage spécial': 6000
    };

    specialRequirements.forEach(requirement => {
      if (requirementFees[requirement]) {
        handlingFees += requirementFees[requirement];
      }
    });

    // Frais supplémentaires selon le type de marchandise
    const goodsHandlingFees: Record<string, number> = {
      PRODUITS_DANGEREUX: 20000,
      LIQUIDES: 8000,
      PRODUITS_CHIMIQUES: 15000,
      BETAIL: 12000,
      VEHICULES: 10000
    };

    if (goodsHandlingFees[goodsType]) {
      handlingFees += goodsHandlingFees[goodsType];
    }

    return handlingFees;
  }

  /**
   * Calculer les frais d'assurance
   */
  private calculateInsuranceFees(declaredValue?: number): number {
    if (!declaredValue || declaredValue <= 0) {
      return 2000; // Assurance minimum
    }

    // 0.5% de la valeur déclarée, minimum 2000 XOF
    const insuranceFee = declaredValue * 0.005;
    return Math.max(insuranceFee, 2000);
  }

  /**
   * Calculer les autres frais (urgence, weekend, etc.)
   */
  private calculateOtherFees(isUrgent?: boolean, departureDate?: Date): number {
    let otherFees = 0;

    // Frais d'urgence
    if (isUrgent) {
      otherFees += 15000;
    }

    // Frais weekend/jours fériés
    if (departureDate) {
      const dayOfWeek = departureDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) { // Dimanche ou Samedi
        otherFees += 8000;
      }
      
      // TODO: Ajouter logique pour jours fériés sénégalais
    }

    return otherFees;
  }

  // ============ GESTION DES RÈGLES DE PRIX ============

  /**
   * Récupérer les règles de prix d'un transporteur
   */
  private async getTransporteurPricingRules(
    transporteurId: string,
    vehicleType: VehicleType,
    goodsType: GoodsType
  ): Promise<any> {
    const now = new Date();
    
    return await prisma.pricingRule.findFirst({
      where: {
        transporteurId,
        isActive: true,
        validFrom: { lte: now },
        OR: [
          { validUntil: null },
          { validUntil: { gte: now } }
        ],
        AND: [
          {
            OR: [
              { vehicleType: null },
              { vehicleType: vehicleType }
            ]
          },
          {
            OR: [
              { goodsType: null },
              { goodsType: goodsType }
            ]
          }
        ]
      },
      orderBy: [
        { vehicleType: 'desc' }, // Préférer les règles spécifiques au véhicule
        { goodsType: 'desc' },   // Préférer les règles spécifiques aux marchandises
        { createdAt: 'desc' }    // Plus récent en priorité
      ]
    });
  }

  /**
   * Trouver les transporteurs adaptés à une commande
   */
  private async findSuitableTransporteurs(criteria: {
    goodsType: GoodsType;
    weight: number;
    volume?: number;
    departureRegion: string;
    destinationRegion: string;
  }) {
    const weightInTons = criteria.weight / 1000;

    return await prisma.transporteur.findMany({
      where: {
        verified: true,
        isOnline: true,
        vehicles: {
          some: {
            isActive: true,
            status: 'DISPONIBLE',
            capacity: { gte: weightInTons }
          }
        }
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true
          }
        },
        vehicles: {
          where: {
            isActive: true,
            status: 'DISPONIBLE',
            capacity: { gte: weightInTons }
          },
          orderBy: [
            { capacity: 'asc' }, // Préférer le véhicule le plus adapté
            { dailyRate: 'asc' }  // Puis le moins cher
          ],
          take: 1
        }
      }
    }).then(transporteurs => 
      transporteurs
        .filter(t => t.vehicles.length > 0)
        .map(t => ({
          ...t,
          bestVehicle: t.vehicles[0]
        }))
    );
  }

  // ============ ANALYSE ET OPTIMISATION ============

  /**
   * Analyser les prix du marché pour une route
   */
  async analyzeMarketPrices(
    departureRegion: string,
    destinationRegion: string,
    goodsType: GoodsType,
    vehicleType: VehicleType
  ): Promise<{
    averagePrice: number;
    minPrice: number;
    maxPrice: number;
    sampleSize: number;
    recommendations: string[];
  }> {
    // Analyser les commandes récentes sur cette route
    const recentOrders = await prisma.transportOrder.findMany({
      where: {
        status: { in: ['LIVRE', 'TERMINE'] },
        goodsType,
        createdAt: {
          gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // 90 derniers jours
        },
        departureAddress: { region: departureRegion },
        destinationAddress: { region: destinationRegion },
        vehicle: { type: vehicleType }
      },
      select: {
        totalPrice: true,
        weight: true,
        estimatedDistance: true
      }
    });

    if (recentOrders.length === 0) {
      return {
        averagePrice: 0,
        minPrice: 0,
        maxPrice: 0,
        sampleSize: 0,
        recommendations: ['Pas de données historiques disponibles pour cette route']
      };
    }

    const prices = recentOrders.map(o => o.totalPrice || 0).filter(p => p > 0);
    const averagePrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    // Générer des recommandations
    const recommendations: string[] = [];
    
    if (prices.length < 5) {
      recommendations.push('Données limitées - prix basé sur des estimations');
    }
    
    const priceVariation = (maxPrice - minPrice) / averagePrice;
    if (priceVariation > 0.5) {
      recommendations.push('Prix très variables sur cette route - négociation possible');
    }

    return {
      averagePrice: Math.round(averagePrice),
      minPrice: Math.round(minPrice),
      maxPrice: Math.round(maxPrice),
      sampleSize: prices.length,
      recommendations
    };
  }

  /**
   * Optimiser les prix pour un transporteur
   */
  async optimizePricingForTransporteur(transporteurId: string): Promise<{
    currentPerformance: any;
    recommendations: string[];
    suggestedAdjustments: any[];
  }> {
    // Analyser les performances actuelles
    const stats = await this.getTransporteurPricingStats(transporteurId);
    
    const recommendations: string[] = [];
    const suggestedAdjustments: any[] = [];

    // Analyser le taux d'acceptation
    if (stats.acceptanceRate < 0.3) {
      recommendations.push('Taux d\'acceptation faible - considérer une baisse des prix');
      suggestedAdjustments.push({
        type: 'price_reduction',
        adjustment: -0.1, // -10%
        reason: 'Améliorer la compétitivité'
      });
    } else if (stats.acceptanceRate > 0.8) {
      recommendations.push('Taux d\'acceptation élevé - possibilité d\'augmenter les prix');
      suggestedAdjustments.push({
        type: 'price_increase',
        adjustment: 0.05, // +5%
        reason: 'Optimiser la rentabilité'
      });
    }

    // Analyser la rapidité de réponse
    if (stats.averageResponseTime > 120) { // Plus de 2h
      recommendations.push('Temps de réponse lent - améliorer la réactivité');
    }

    return {
      currentPerformance: stats,
      recommendations,
      suggestedAdjustments
    };
  }

  /**
   * Récupérer les statistiques de prix d'un transporteur
   */
  private async getTransporteurPricingStats(transporteurId: string) {
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [quotesStats, ordersStats] = await Promise.all([
      prisma.quote.groupBy({
        by: ['status'],
        where: {
          transporteurId,
          createdAt: { gte: last30Days }
        },
        _count: { id: true },
        _avg: { totalPrice: true }
      }),
      prisma.transportOrder.groupBy({
        by: ['status'],
        where: {
          transporteurId,
          createdAt: { gte: last30Days }
        },
        _count: { id: true }
      })
    ]);

    const totalQuotes = quotesStats.reduce((sum, stat) => sum + stat._count.id, 0);
    const acceptedQuotes = quotesStats.find(s => s.status === 'ACCEPTE')?._count.id || 0;
    const acceptanceRate = totalQuotes > 0 ? acceptedQuotes / totalQuotes : 0;

    return {
      totalQuotes,
      acceptedQuotes,
      acceptanceRate,
      averageQuotePrice: quotesStats.find(s => s.status === 'ACCEPTE')?._avg.totalPrice || 0,
      averageResponseTime: 60 // TODO: Calculer depuis les données réelles
    };
  }
}

// Export de l'instance
export const pricingService = new PricingService();