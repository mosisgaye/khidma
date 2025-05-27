import { VehicleType, GoodsType, TransportOrderStatus } from '@prisma/client';
import { 
  TransportSearchFilters,
  PaginatedResponse,
  Coordinates
} from '@/types/transport.types';
import prisma from '@/config/database';
import { geolocationService } from './geolocation.service';

// ============ SERVICE RECHERCHE ET FILTRAGE AVANCÉ ============

export class SearchService {

  // ============ RECHERCHE DE COMMANDES ============

  /**
   * Recherche avancée de commandes de transport
   */
  async searchTransportOrders(
    filters: TransportSearchFilters & {
      userRole?: string;
      userId?: string;
    }
  ): Promise<PaginatedResponse<any>> {
    const { 
      page = 1, 
      limit = 10, 
      sortBy = 'date', 
      sortOrder = 'desc',
      userRole,
      userId,
      ...searchFilters 
    } = filters;
    
    const skip = (page - 1) * limit;

    // Construire les conditions de base
    let whereCondition: any = {
      status: {
        in: [
          TransportOrderStatus.DEMANDE,
          TransportOrderStatus.DEVIS_ENVOYE,
          TransportOrderStatus.DEVIS_ACCEPTE
        ]
      }
    };

    // Filtres selon le rôle utilisateur
    if (userRole === 'TRANSPORTEUR' && userId) {
      const transporteur = await prisma.transporteur.findUnique({
        where: { userId },
        select: { id: true }
      });
      
      if (transporteur) {
        // Pour les transporteurs, exclure leurs propres commandes
        whereCondition.transporteurId = { not: transporteur.id };
      }
    } else if (userRole === 'EXPEDITEUR' && userId) {
      const expediteur = await prisma.expediteur.findUnique({
        where: { userId },
        select: { id: true }
      });
      
      if (expediteur) {
        // Pour les expéditeurs, montrer seulement leurs commandes
        whereCondition.expediteurId = expediteur.id;
      }
    }

    // Appliquer les filtres avancés
    whereCondition = this.applyAdvancedFilters(whereCondition, searchFilters);

    // Définir l'ordre de tri
    const orderBy = this.buildOrderBy(sortBy, sortOrder);

    // Exécuter la recherche avec agrégations
    const [orders, total, aggregations] = await Promise.all([
      prisma.transportOrder.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy,
        include: {
          expediteur: {
            include: {
              user: {
                select: { firstName: true, lastName: true, phone: true }
              }
            }
          },
          transporteur: {
            include: {
              user: {
                select: { firstName: true, lastName: true }
              }
            }
          },
          vehicle: {
            select: { 
              type: true, 
              brand: true, 
              model: true, 
              plateNumber: true,
              capacity: true
            }
          },
          departureAddress: true,
          destinationAddress: true,
          quotes: {
            where: { status: { not: 'BROUILLON' } },
            orderBy: { totalPrice: 'asc' },
            take: 3,
            select: {
              id: true,
              totalPrice: true,
              status: true,
              transporteurId: true
            }
          }
        }
      }),
      prisma.transportOrder.count({ where: whereCondition }),
      this.getSearchAggregations(whereCondition)
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: orders.map(order => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        priority: order.priority,
        
        // Informations marchandise
        goodsType: order.goodsType,
        goodsDescription: order.goodsDescription,
        weight: order.weight,
        volume: order.volume,
        specialRequirements: order.specialRequirements,
        declaredValue: order.declaredValue,
        
        // Dates et timing
        departureDate: order.departureDate,
        departureTime: order.departureTime,
        deliveryDate: order.deliveryDate,
        createdAt: order.createdAt,
        
        // Géographie
        route: {
          departure: {
            city: order.departureAddress.city,
            region: order.departureAddress.region,
            coordinates: order.departureAddress.latitude && order.departureAddress.longitude 
              ? { latitude: order.departureAddress.latitude, longitude: order.departureAddress.longitude }
              : null
          },
          destination: {
            city: order.destinationAddress.city,
            region: order.destinationAddress.region,
            coordinates: order.destinationAddress.latitude && order.destinationAddress.longitude 
              ? { latitude: order.destinationAddress.latitude, longitude: order.destinationAddress.longitude }
              : null
          }
        },
        
        // Estimations
        estimatedDistance: order.estimatedDistance,
        estimatedDuration: order.estimatedDuration,
        basePrice: order.basePrice,
        totalPrice: order.totalPrice,
        
        // Participants
        expediteur: {
          id: order.expediteur.id,
          name: `${order.expediteur.user.firstName} ${order.expediteur.user.lastName}`,
          companyName: order.expediteur.companyName,
          phone: order.expediteur.user.phone,
          verified: order.expediteur.verified,
          rating: order.expediteur.rating,
          totalOrders: order.expediteur.totalOrders
        },
        
        transporteur: order.transporteur ? {
          id: order.transporteur.id,
          name: `${order.transporteur.user.firstName} ${order.transporteur.user.lastName}`,
          companyName: order.transporteur.companyName,
          verified: order.transporteur.verified,
          rating: order.transporteur.rating
        } : null,
        
        vehicle: order.vehicle,
        
        // Devis disponibles
        quotes: order.quotes.map(quote => ({
          id: quote.id,
          totalPrice: quote.totalPrice,
          status: quote.status,
          transporteurId: quote.transporteurId
        })),
        
        // Métriques
        metrics: {
          quotesCount: order.quotes.length,
          hasUrgentPriority: order.priority === 'URGENT',
          isLongDistance: (order.estimatedDistance || 0) > 500,
          isHeavyLoad: order.weight > 10000,
          requiresSpecialHandling: order.specialRequirements.length > 0
        }
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      aggregations
    };
  }

  /**
   * Recherche de transporteurs avec filtres avancés
   */
  async searchTransporteurs(filters: {
    region?: string;
    city?: string;
    vehicleTypes?: VehicleType[];
    minRating?: number;
    maxRating?: number;
    verifiedOnly?: boolean;
    availableOnly?: boolean;
    minCapacity?: number;
    maxCapacity?: number;
    specializations?: GoodsType[];
    maxDistance?: number;
    coordinates?: Coordinates;
    page?: number;
    limit?: number;
    sortBy?: 'rating' | 'distance' | 'price' | 'experience';
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<any>> {
    const { 
      page = 1, 
      limit = 10, 
      sortBy = 'rating', 
      sortOrder = 'desc',
      ...searchFilters 
    } = filters;
    
    const skip = (page - 1) * limit;

    // Construire les conditions de recherche
    let whereCondition: any = {
      verified: searchFilters.verifiedOnly !== false,
      user: {
        status: 'ACTIVE'
      }
    };

    // Filtres sur les évaluations
    if (searchFilters.minRating !== undefined) {
      whereCondition.rating = { gte: searchFilters.minRating };
    }
    if (searchFilters.maxRating !== undefined) {
      whereCondition.rating = { 
        ...whereCondition.rating,
        lte: searchFilters.maxRating 
      };
    }

    // Filtres sur les véhicules
    const vehicleFilters: any = {
      isActive: true
    };

    if (searchFilters.availableOnly) {
      vehicleFilters.status = 'DISPONIBLE';
    }

    if (searchFilters.vehicleTypes && searchFilters.vehicleTypes.length > 0) {
      vehicleFilters.type = { in: searchFilters.vehicleTypes };
    }

    if (searchFilters.minCapacity !== undefined || searchFilters.maxCapacity !== undefined) {
      vehicleFilters.capacity = {};
      if (searchFilters.minCapacity !== undefined) {
        vehicleFilters.capacity.gte = searchFilters.minCapacity;
      }
      if (searchFilters.maxCapacity !== undefined) {
        vehicleFilters.capacity.lte = searchFilters.maxCapacity;
      }
    }

    // Ajouter le filtre véhicules
    whereCondition.vehicles = {
      some: vehicleFilters
    };

    // Définir l'ordre de tri
    let orderBy: any = {};
    switch (sortBy) {
      case 'rating':
        orderBy = { rating: sortOrder };
        break;
      case 'experience':
        orderBy = { totalRides: sortOrder };
        break;
      case 'price':
        // TODO: Implémenter tri par prix moyen
        orderBy = { rating: 'desc' };
        break;
      default:
        orderBy = { rating: 'desc' };
    }

    // Rechercher les transporteurs
    const [transporteurs, total] = await Promise.all([
      prisma.transporteur.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy,
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              phone: true,
              avatar: true
            }
          },
          vehicles: {
            where: vehicleFilters,
            select: {
              id: true,
              type: true,
              brand: true,
              model: true,
              capacity: true,
              volume: true,
              status: true,
              features: true,
              dailyRate: true,
              kmRate: true
            },
            orderBy: { capacity: 'asc' }
          },
          reviews: {
            where: { isPublic: true },
            select: {
              overallRating: true,
              comment: true,
              createdAt: true
            },
            orderBy: { createdAt: 'desc' },
            take: 3
          }
        }
      }),
      prisma.transporteur.count({ where: whereCondition })
    ]);

    // Calculer la distance si coordonnées fournies
    const transporteursWithDistance = await this.calculateDistancesToTransporteurs(
      transporteurs,
      searchFilters.coordinates,
      searchFilters.maxDistance
    );

    const totalPages = Math.ceil(total / limit);

    return {
      data: transporteursWithDistance.map(transporteur => ({
        id: transporteur.id,
        user: transporteur.user,
        companyName: transporteur.companyName,
        rating: transporteur.rating,
        totalRides: transporteur.totalRides,
        completionRate: transporteur.completionRate,
        onTimeRate: transporteur.onTimeRate,
        responseTime: transporteur.responseTime,
        verified: transporteur.verified,
        isOnline: transporteur.isOnline,
        yearsExperience: transporteur.yearsExperience,
        fleetSize: transporteur.fleetSize,
        
        // Véhicules disponibles
        vehicles: transporteur.vehicles,
        
        // Évaluations récentes
        recentReviews: transporteur.reviews,
        
        // Métriques calculées
        metrics: {
          averageRating: transporteur.rating,
          totalReviews: transporteur.reviews.length,
          distance: transporteur.distance,
          priceRange: this.calculatePriceRange(transporteur.vehicles),
          capabilities: this.extractCapabilities(transporteur.vehicles),
          availability: this.checkAvailability(transporteur.vehicles)
        }
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }

  /**
   * Recherche intelligente avec suggestions
   */
  async intelligentSearch(query: string, filters?: any): Promise<{
    orders: any[];
    transporteurs: any[];
    vehicles: any[];
    suggestions: string[];
    corrections: string[];
  }> {
    // Analyser la requête
    const searchTerms = this.parseSearchQuery(query);
    
    // Recherche parallèle dans différentes entités
    const [orders, transporteurs, vehicles] = await Promise.all([
      this.searchOrdersByTerms(searchTerms, filters),
      this.searchTransporteursByTerms(searchTerms, filters),
      this.searchVehiclesByTerms(searchTerms, filters)
    ]);

    // Générer des suggestions
    const suggestions = await this.generateSuggestions(searchTerms);
    
    // Générer des corrections orthographiques
    const corrections = this.generateCorrections(query);

    return {
      orders: orders.slice(0, 5),
      transporteurs: transporteurs.slice(0, 5),
      vehicles: vehicles.slice(0, 5),
      suggestions,
      corrections
    };
  }

  /**
   * Obtenir des recommandations personnalisées
   */
  async getRecommendations(
    userId: string,
    userRole: string
  ): Promise<{
    recommendedOrders?: any[];
    recommendedTransporteurs?: any[];
    trendingRoutes?: any[];
    personalizedSuggestions: string[];
  }> {
    if (userRole === 'TRANSPORTEUR') {
      return await this.getTransporteurRecommendations(userId);
    } else if (userRole === 'EXPEDITEUR') {
      return await this.getExpediteurRecommendations(userId);
    }
    
    return { personalizedSuggestions: [] };
  }

  // ============ MÉTHODES PRIVÉES ============

  /**
   * Appliquer les filtres avancés
   */
  private applyAdvancedFilters(whereCondition: any, filters: any): any {
    // Filtres géographiques
    if (filters.departureRegion) {
      whereCondition.departureAddress = {
        region: { contains: filters.departureRegion, mode: 'insensitive' }
      };
    }
    
    if (filters.departureCity) {
      whereCondition.departureAddress = {
        ...whereCondition.departureAddress,
        city: { contains: filters.departureCity, mode: 'insensitive' }
      };
    }

    if (filters.destinationRegion) {
      whereCondition.destinationAddress = {
        region: { contains: filters.destinationRegion, mode: 'insensitive' }
      };
    }
    
    if (filters.destinationCity) {
      whereCondition.destinationAddress = {
        ...whereCondition.destinationAddress,
        city: { contains: filters.destinationCity, mode: 'insensitive' }
      };
    }

    // Filtres marchandise
    if (filters.goodsType) {
      whereCondition.goodsType = filters.goodsType;
    }

    if (filters.minWeight !== undefined || filters.maxWeight !== undefined) {
      whereCondition.weight = {};
      if (filters.minWeight !== undefined) {
        whereCondition.weight.gte = filters.minWeight;
      }
      if (filters.maxWeight !== undefined) {
        whereCondition.weight.lte = filters.maxWeight;
      }
    }

    if (filters.minVolume !== undefined || filters.maxVolume !== undefined) {
      whereCondition.volume = {};
      if (filters.minVolume !== undefined) {
        whereCondition.volume.gte = filters.minVolume;
      }
      if (filters.maxVolume !== undefined) {
        whereCondition.volume.lte = filters.maxVolume;
      }
    }

    // Filtres véhicule
    if (filters.vehicleType) {
      whereCondition.vehicle = {
        type: filters.vehicleType
      };
    }

    if (filters.minCapacity !== undefined || filters.maxCapacity !== undefined) {
      whereCondition.vehicle = {
        ...whereCondition.vehicle,
        capacity: {}
      };
      if (filters.minCapacity !== undefined) {
        whereCondition.vehicle.capacity.gte = filters.minCapacity;
      }
      if (filters.maxCapacity !== undefined) {
        whereCondition.vehicle.capacity.lte = filters.maxCapacity;
      }
    }

    // Filtres dates
    if (filters.departureDateFrom || filters.departureDateTo) {
      whereCondition.departureDate = {};
      if (filters.departureDateFrom) {
        whereCondition.departureDate.gte = filters.departureDateFrom;
      }
      if (filters.departureDateTo) {
        whereCondition.departureDate.lte = filters.departureDateTo;
      }
    }

    // Filtres prix
    if (filters.maxPrice) {
      whereCondition.totalPrice = { lte: filters.maxPrice };
    }

    // Filtres spéciaux
    if (filters.hasSpecialRequirements) {
      whereCondition.specialRequirements = { not: [] };
    }

    if (filters.priority && filters.priority.length > 0) {
      whereCondition.priority = { in: filters.priority };
    }

    return whereCondition;
  }

  /**
   * Construire l'ordre de tri
   */
  private buildOrderBy(sortBy: string, sortOrder: string): any {
    switch (sortBy) {
      case 'price':
        return { totalPrice: sortOrder };
      case 'distance':
        return { estimatedDistance: sortOrder };
      case 'rating':
        return { expediteur: { rating: sortOrder } };
      case 'date':
      default:
        return { departureDate: sortOrder };
    }
  }

  /**
   * Obtenir les agrégations de recherche
   */
  private async getSearchAggregations(whereCondition: any): Promise<any> {
    const [
      goodsTypeStats,
      regionStats,
      priceStats,
      priorityStats
    ] = await Promise.all([
      prisma.transportOrder.groupBy({
        by: ['goodsType'],
        where: whereCondition,
        _count: { id: true }
      }),
      
      prisma.transportOrder.findMany({
        where: whereCondition,
        select: {
          departureAddress: { select: { region: true } },
          destinationAddress: { select: { region: true } }
        }
      }).then(orders => {
        const regions = new Map();
        orders.forEach(order => {
          const depRegion = order.departureAddress.region;
          const destRegion = order.destinationAddress.region;
          regions.set(depRegion, (regions.get(depRegion) || 0) + 1);
          regions.set(destRegion, (regions.get(destRegion) || 0) + 1);
        });
        return Array.from(regions.entries()).map(([region, count]) => ({ region, count }));
      }),
      
      prisma.transportOrder.aggregate({
        where: whereCondition,
        _avg: { totalPrice: true },
        _min: { totalPrice: true },
        _max: { totalPrice: true }
      }),
      
      prisma.transportOrder.groupBy({
        by: ['priority'],
        where: whereCondition,
        _count: { id: true }
      })
    ]);

    return {
      goodsTypes: goodsTypeStats.map(stat => ({
        type: stat.goodsType,
        count: stat._count.id
      })),
      regions: regionStats.slice(0, 10),
      priceRange: {
        average: priceStats._avg.totalPrice,
        min: priceStats._min.totalPrice,
        max: priceStats._max.totalPrice
      },
      priorities: priorityStats.map(stat => ({
        priority: stat.priority,
        count: stat._count.id
      }))
    };
  }

  /**
   * Calculer la distance aux transporteurs
   */
  private async calculateDistancesToTransporteurs(
    transporteurs: any[],
    coordinates?: Coordinates,
    maxDistance?: number
  ): Promise<any[]> {
    if (!coordinates) {
      return transporteurs.map(t => ({ ...t, distance: null }));
    }

    const transporteursWithDistance = [];
    
    for (const transporteur of transporteurs) {
      // TODO: Obtenir les coordonnées du transporteur depuis son adresse
      // Pour l'instant, on simule une distance aléatoire
      const distance = Math.random() * 100;
      
      if (!maxDistance || distance <= maxDistance) {
        transporteursWithDistance.push({
          ...transporteur,
          distance: Math.round(distance * 100) / 100
        });
      }
    }

    // Trier par distance si coordonnées fournies
    return transporteursWithDistance.sort((a, b) => (a.distance || 0) - (b.distance || 0));
  }

  /**
   * Calculer la fourchette de prix d'un transporteur
   */
  private calculatePriceRange(vehicles: any[]): { min: number; max: number } | null {
    if (!vehicles.length) return null;
    
    const rates = vehicles
      .filter(v => v.dailyRate || v.kmRate)
      .map(v => v.dailyRate || v.kmRate || 0);
    
    if (!rates.length) return null;
    
    return {
      min: Math.min(...rates),
      max: Math.max(...rates)
    };
  }

  /**
   * Extraire les capacités d'un transporteur
   */
  private extractCapabilities(vehicles: any[]): string[] {
    const capabilities = new Set<string>();
    
    vehicles.forEach(vehicle => {
      capabilities.add(vehicle.type);
      vehicle.features?.forEach((feature: string) => capabilities.add(feature));
    });
    
    return Array.from(capabilities);
  }

  /**
   * Vérifier la disponibilité d'un transporteur
   */
  private checkAvailability(vehicles: any[]): 'available' | 'busy' | 'limited' {
    const availableVehicles = vehicles.filter(v => v.status === 'DISPONIBLE');
    
    if (availableVehicles.length === 0) return 'busy';
    if (availableVehicles.length === vehicles.length) return 'available';
    return 'limited';
  }

  /**
   * Parser une requête de recherche
   */
  private parseSearchQuery(query: string): {
    cities: string[];
    goodsTypes: string[];
    weights: number[];
    dates: Date[];
    general: string[];
  } {
    const terms = query.toLowerCase().split(/\s+/);
    
    // Villes sénégalaises communes
    const senegalCities = ['dakar', 'thiès', 'kaolack', 'saint-louis', 'ziguinchor', 'diourbel', 'louga', 'fatick'];
    const cities = terms.filter(term => senegalCities.some(city => city.includes(term) || term.includes(city)));
    
    // Types de marchandises
    const goodsKeywords = {
      'matériaux': 'MATERIAUX_CONSTRUCTION',
      'construction': 'MATERIAUX_CONSTRUCTION',
      'alimentaire': 'PRODUITS_ALIMENTAIRES',
      'nourriture': 'PRODUITS_ALIMENTAIRES',
      'véhicule': 'VEHICULES',
      'voiture': 'VEHICULES',
      'chimique': 'PRODUITS_CHIMIQUES',
      'liquide': 'LIQUIDES',
      'céréale': 'CEREALES',
      'grain': 'CEREALES'
    };
    
    const goodsTypes = terms
      .map(term => Object.keys(goodsKeywords).find(keyword => term.includes(keyword)))
      .filter(Boolean)
      .map(keyword => goodsKeywords[keyword!]);
    
    // Poids (recherche de patterns comme "5t", "1000kg")
    const weights = terms
      .map(term => {
        const tonMatch = term.match(/(\d+)t/);
        if (tonMatch) return parseInt(tonMatch[1]) * 1000;
        
        const kgMatch = term.match(/(\d+)kg/);
        if (kgMatch) return parseInt(kgMatch[1]);
        
        return null;
      })
      .filter(Boolean) as number[];
    
    // Termes généraux
    const general = terms.filter(term => 
      !cities.includes(term) && 
      !Object.keys(goodsKeywords).some(keyword => term.includes(keyword)) &&
      !term.match(/\d+[tk]g?/)
    );
    
    return {
      cities,
      goodsTypes,
      weights,
      dates: [], // TODO: Parser les dates
      general
    };
  }

  /**
   * Rechercher des commandes par termes
   */
  private async searchOrdersByTerms(searchTerms: any, filters?: any): Promise<any[]> {
    const whereCondition: any = {
      status: { in: ['DEMANDE', 'DEVIS_ENVOYE'] }
    };
    
    if (searchTerms.cities.length > 0) {
      whereCondition.OR = [
        {
          departureAddress: {
            city: { in: searchTerms.cities, mode: 'insensitive' }
          }
        },
        {
          destinationAddress: {
            city: { in: searchTerms.cities, mode: 'insensitive' }
          }
        }
      ];
    }
    
    if (searchTerms.goodsTypes.length > 0) {
      whereCondition.goodsType = { in: searchTerms.goodsTypes };
    }
    
    return await prisma.transportOrder.findMany({
      where: whereCondition,
      take: 10,
      include: {
        departureAddress: { select: { city: true, region: true } },
        destinationAddress: { select: { city: true, region: true } }
      }
    });
  }

  /**
   * Rechercher des transporteurs par termes
   */
  private async searchTransporteursByTerms(searchTerms: any, filters?: any): Promise<any[]> {
    const whereCondition: any = {
      verified: true,
      user: { status: 'ACTIVE' }
    };
    
    if (searchTerms.general.length > 0) {
      whereCondition.OR = [
        {
          companyName: {
            contains: searchTerms.general.join(' '),
            mode: 'insensitive'
          }
        },
        {
          user: {
            OR: [
              { firstName: { contains: searchTerms.general[0], mode: 'insensitive' } },
              { lastName: { contains: searchTerms.general[0], mode: 'insensitive' } }
            ]
          }
        }
      ];
    }
    
    return await prisma.transporteur.findMany({
      where: whereCondition,
      take: 10,
      include: {
        user: { select: { firstName: true, lastName: true } },
        vehicles: { 
          where: { isActive: true },
          select: { type: true, capacity: true }
        }
      }
    });
  }

  /**
   * Rechercher des véhicules par termes
   */
  private async searchVehiclesByTerms(searchTerms: any, filters?: any): Promise<any[]> {
    const whereCondition: any = {
      isActive: true,
      status: 'DISPONIBLE'
    };
    
    if (searchTerms.weights.length > 0) {
      const maxWeight = Math.max(...searchTerms.weights) / 1000; // Convertir en tonnes
      whereCondition.capacity = { gte: maxWeight };
    }
    
    return await prisma.vehicle.findMany({
      where: whereCondition,
      take: 10,
      include: {
        transporteur: {
          include: {
            user: { select: { firstName: true, lastName: true } }
          }
        }
      }
    });
  }

  /**
   * Générer des suggestions de recherche
   */
  private async generateSuggestions(searchTerms: any): Promise<string[]> {
    const suggestions = [];
    
    // Suggestions de villes populaires
    const popularRoutes = await prisma.transportOrder.groupBy({
      by: ['departureAddress', 'destinationAddress'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5
    });
    
    // TODO: Améliorer les suggestions basées sur l'historique
    
    return [
      'Dakar vers Thiès',
      'Transport matériaux construction',
      'Camion 10T disponible',
      'Livraison express Saint-Louis'
    ];
  }

  /**
   * Générer des corrections orthographiques
   */
  private generateCorrections(query: string): string[] {
    // TODO: Implémenter un système de correction orthographique
    return [];
  }

  /**
   * Recommandations pour transporteurs
   */
  private async getTransporteurRecommendations(userId: string): Promise<any> {
    const transporteur = await prisma.transporteur.findUnique({
      where: { userId },
      include: {
        vehicles: true,
        transportOrders: {
          take: 10,
          orderBy: { completedAt: 'desc' },
          include: {
            departureAddress: true,
            destinationAddress: true
          }
        }
      }
    });

    if (!transporteur) {
      return { personalizedSuggestions: [] };
    }

    // Analyser les préférences basées sur l'historique
    const routePreferences = this.analyzeRoutePreferences(transporteur.transportOrders);
    
    // Recommander des commandes similaires
    const recommendedOrders = await prisma.transportOrder.findMany({
      where: {
        status: 'DEMANDE',
        transporteurId: null,
        departureAddress: {
          region: { in: routePreferences.preferredRegions }
        }
      },
      take: 5,
      include: {
        departureAddress: true,
        destinationAddress: true,
        expediteur: {
          include: { user: { select: { firstName: true, lastName: true } } }
        }
      }
    });

    return {
      recommendedOrders,
      personalizedSuggestions: [
        `Commandes vers ${routePreferences.preferredRegions[0]}`,
        `${routePreferences.preferredGoodsTypes[0]} disponibles`,
        'Optimisez vos trajets retour'
      ]
    };
  }

  /**
   * Recommandations pour expéditeurs
   */
  private async getExpediteurRecommendations(userId: string): Promise<any> {
    const expediteur = await prisma.expediteur.findUnique({
      where: { userId },
      include: {
        transportOrders: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: { transporteur: true }
        }
      }
    });

    if (!expediteur) {
      return { personalizedSuggestions: [] };
    }

    // Recommander des transporteurs fiables
    const recommendedTransporteurs = await prisma.transporteur.findMany({
      where: {
        verified: true,
        rating: { gte: 4.0 },
        isOnline: true
      },
      take: 5,
      include: {
        user: { select: { firstName: true, lastName: true } },
        vehicles: { where: { status: 'DISPONIBLE' } }
      }
    });

    return {
      recommendedTransporteurs,
      personalizedSuggestions: [
        'Transporteurs recommandés pour vous',
        'Nouveaux transporteurs dans votre région',
        'Offres spéciales du mois'
      ]
    };
  }

  /**
   * Analyser les préférences de route
   */
  private analyzeRoutePreferences(orders: any[]): {
    preferredRegions: string[];
    preferredGoodsTypes: string[];
  } {
    const regionCounts = new Map();
    const goodsTypeCounts = new Map();
    
    orders.forEach(order => {
      const depRegion = order.departureAddress?.region;
      const destRegion = order.destinationAddress?.region;
      
      if (depRegion) regionCounts.set(depRegion, (regionCounts.get(depRegion) || 0) + 1);
      if (destRegion) regionCounts.set(destRegion, (regionCounts.get(destRegion) || 0) + 1);
      
      if (order.goodsType) {
        goodsTypeCounts.set(order.goodsType, (goodsTypeCounts.get(order.goodsType) || 0) + 1);
      }
    });
    
    const preferredRegions = Array.from(regionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([region]) => region);
    
    const preferredGoodsTypes = Array.from(goodsTypeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([goodsType]) => goodsType);
    
    return { preferredRegions, preferredGoodsTypes };
  }
}

// Export de l'instance
export const searchService = new SearchService();