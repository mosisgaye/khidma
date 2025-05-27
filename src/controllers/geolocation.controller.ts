import { Request, Response } from 'express';
import { geolocationService } from '@/services/transport/geolocation.service';
import { ApiResponse, HTTP_STATUS, AuthenticatedRequest } from '@/types/api.types';
import { calculateDistanceSchema, CalculateDistanceInput } from '@/schemas/transport.schema';
import { asyncHandler } from '@/middleware/errorHandler';

// ============ CONTRÔLEUR GÉOLOCALISATION ============

export class GeolocationController {

  // ============ CALCUL DE DISTANCES ============

  /**
   * Calculer la distance entre deux coordonnées GPS
   * POST /api/v1/geolocation/distance/calculate
   */
  calculateDistance = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Validation des données
    const validatedData = calculateDistanceSchema.parse(req.body) as CalculateDistanceInput;

    // Calculer la distance
    const result = geolocationService.calculateDistance(
      validatedData.departure,
      validatedData.destination
    );

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Distance calculée avec succès',
      data: {
        distance: result,
        departure: {
          coordinates: validatedData.departure,
          address: req.body.departureAddress || 'Non spécifiée'
        },
        destination: {
          coordinates: validatedData.destination,
          address: req.body.destinationAddress || 'Non spécifiée'
        },
        travelInfo: {
          estimatedFuelCost: this.calculateFuelCost(result.distance),
          estimatedTollCost: this.calculateTollCost(result.distance),
          carbonFootprint: this.calculateCarbonFootprint(result.distance)
        }
      },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  /**
   * Calculer la distance entre deux adresses stockées
   * POST /api/v1/geolocation/distance/addresses
   */
  calculateDistanceBetweenAddresses = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { departureAddressId, destinationAddressId } = req.body;

    if (!departureAddressId || !destinationAddressId) {
      const response: ApiResponse = {
        success: false,
        message: 'IDs des adresses de départ et destination requis',
        timestamp: new Date().toISOString()
      };
      res.status(HTTP_STATUS.BAD_REQUEST).json(response);
      return;
    }

    // Calculer la distance
    const result = await geolocationService.calculateDistanceBetweenAddresses(
      departureAddressId,
      destinationAddressId
    );

    if (!result) {
      const response: ApiResponse = {
        success: false,
        message: 'Impossible de calculer la distance - adresses non géolocalisées',
        timestamp: new Date().toISOString()
      };
      res.status(HTTP_STATUS.BAD_REQUEST).json(response);
      return;
    }

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Distance entre adresses calculée',
      data: {
        distance: result,
        estimatedCosts: {
          fuel: this.calculateFuelCost(result.distance),
          toll: this.calculateTollCost(result.distance),
          driver: this.calculateDriverCost(result.duration)
        }
      },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  // ============ RECHERCHE GÉOGRAPHIQUE ============

  /**
   * Trouver des adresses dans un rayon donné
   * POST /api/v1/geolocation/search/radius
   */
  searchInRadius = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { latitude, longitude, radius, limit } = req.body;

    // Validation basique
    if (!latitude || !longitude || !radius) {
      const response: ApiResponse = {
        success: false,
        message: 'Coordonnées (latitude, longitude) et rayon requis',
        timestamp: new Date().toISOString()
      };
      res.status(HTTP_STATUS.BAD_REQUEST).json(response);
      return;
    }

    if (radius > 200) {
      const response: ApiResponse = {
        success: false,
        message: 'Rayon maximum autorisé: 200 km',
        timestamp: new Date().toISOString()
      };
      res.status(HTTP_STATUS.BAD_REQUEST).json(response);
      return;
    }

    // Rechercher les adresses
    const addresses = await geolocationService.findAddressesInRadius(
      { latitude: parseFloat(latitude), longitude: parseFloat(longitude) },
      parseFloat(radius),
      parseInt(limit) || 50
    );

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: `${addresses.length} adresse(s) trouvée(s) dans un rayon de ${radius}km`,
      data: {
        centerPoint: { latitude, longitude },
        radius: parseFloat(radius),
        addresses,
        count: addresses.length
      },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  /**
   * Obtenir les coordonnées d'une ville
   * GET /api/v1/geolocation/cities/:cityName/coordinates
   */
  getCityCoordinates = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { cityName } = req.params;
    const { region } = req.query;

    // Rechercher les coordonnées
    const coordinates = await geolocationService.getCityCoordinates(
      cityName,
      region as string
    );

    if (!coordinates) {
      const response: ApiResponse = {
        success: false,
        message: `Coordonnées non trouvées pour la ville "${cityName}"`,
        timestamp: new Date().toISOString()
      };
      res.status(HTTP_STATUS.NOT_FOUND).json(response);
      return;
    }

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Coordonnées de la ville récupérées',
      data: {
        city: cityName,
        region: region || 'Non spécifiée',
        coordinates,
        accuracy: 'city_level'
      },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  // ============ OPTIMISATION D'ITINÉRAIRES ============

  /**
   * Optimiser un itinéraire multi-points
   * POST /api/v1/geolocation/routes/optimize
   */
  optimizeRoute = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { waypoints, vehicleType } = req.body;

    if (!waypoints || !Array.isArray(waypoints) || waypoints.length < 2) {
      const response: ApiResponse = {
        success: false,
        message: 'Au moins 2 points de passage requis',
        timestamp: new Date().toISOString()
      };
      res.status(HTTP_STATUS.BAD_REQUEST).json(response);
      return;
    }

    if (waypoints.length > 20) {
      const response: ApiResponse = {
        success: false,
        message: 'Maximum 20 points de passage autorisés',
        timestamp: new Date().toISOString()
      };
      res.status(HTTP_STATUS.BAD_REQUEST).json(response);
      return;
    }

    // Valider les coordonnées
    for (const point of waypoints) {
      if (!point.latitude || !point.longitude) {
        const response: ApiResponse = {
          success: false,
          message: 'Toutes les coordonnées (latitude, longitude) sont requises',
          timestamp: new Date().toISOString()
        };
        res.status(HTTP_STATUS.BAD_REQUEST).json(response);
        return;
      }
    }

    // Optimiser l'itinéraire
    const optimization = geolocationService.calculateOptimizedRoute(waypoints);

    // Calculer le temps de trajet ajusté selon le véhicule
    const adjustedDuration = geolocationService.calculateTravelTime(
      optimization.totalDistance,
      vehicleType || 'CAMION_10T'
    );

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Itinéraire optimisé calculé',
      data: {
        original: {
          waypoints,
          order: waypoints.map((_, index) => index)
        },
        optimized: {
          waypoints: optimization.optimizedOrder.map(index => waypoints[index]),
          order: optimization.optimizedOrder,
          totalDistance: optimization.totalDistance,
          estimatedDuration: adjustedDuration,
          savings: {
            distance: 0, // À calculer en comparant avec l'ordre original
            time: 0,
            fuel: this.calculateFuelCost(optimization.totalDistance)
          }
        },
        vehicleInfo: {
          type: vehicleType || 'CAMION_10T',
          estimatedFuelCost: this.calculateFuelCost(optimization.totalDistance),
          estimatedTollCost: this.calculateTollCost(optimization.totalDistance)
        }
      },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  // ============ ANALYSES GÉOGRAPHIQUES ============

  /**
   * Obtenir les statistiques géographiques du transport
   * GET /api/v1/geolocation/stats/geography
   */
  getGeographyStats = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Récupérer les statistiques
    const stats = await geolocationService.getTransportGeographyStats();

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: 'Statistiques géographiques récupérées',
      data: {
        summary: {
          totalOrders: stats.totalOrders,
          uniqueRegions: stats.departureDistribution.length,
          popularRoutesCount: stats.popularRoutes.length
        },
        distribution: {
          departures: stats.departureDistribution,
          destinations: stats.destinationDistribution
        },
        popularRoutes: stats.popularRoutes.map((route: any) => ({
          ...route,
          percentage: (route._count.id / stats.totalOrders * 100).toFixed(2)
        })),
        insights: this.generateGeographyInsights(stats)
      },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  /**
   * Vérifier si un point est dans une zone
   * POST /api/v1/geolocation/zones/check
   */
  checkPointInZone = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { latitude, longitude, region } = req.body;

    if (!latitude || !longitude || !region) {
      const response: ApiResponse = {
        success: false,
        message: 'Coordonnées et région requis',
        timestamp: new Date().toISOString()
      };
      res.status(HTTP_STATUS.BAD_REQUEST).json(response);
      return;
    }

    // Vérifier la zone
    const isInRegion = await geolocationService.isPointInRegion(
      { latitude: parseFloat(latitude), longitude: parseFloat(longitude) },
      region
    );

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: `Point ${isInRegion ? 'situé dans' : 'situé hors de'} la région ${region}`,
      data: {
        point: { latitude: parseFloat(latitude), longitude: parseFloat(longitude) },
        region,
        isInRegion,
        accuracy: 'approximate'
      },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  // ============ OUTILS DE CONVERSION ============

  /**
   * Convertir des unités de distance
   * GET /api/v1/geolocation/convert
   */
  convertUnits = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { value, from, to } = req.query;

    if (!value || !from || !to) {
      const response: ApiResponse = {
        success: false,
        message: 'Paramètres requis: value, from, to',
        timestamp: new Date().toISOString()
      };
      res.status(HTTP_STATUS.BAD_REQUEST).json(response);
      return;
    }

    const numValue = parseFloat(value as string);
    let result: number;

    // Conversions supportées
    if (from === 'km' && to === 'miles') {
      result = geolocationService.kmToMiles(numValue);
    } else if (from === 'miles' && to === 'km') {
      result = geolocationService.milesToKm(numValue);
    } else {
      const response: ApiResponse = {
        success: false,
        message: 'Conversion non supportée. Conversions disponibles: km ↔ miles',
        timestamp: new Date().toISOString()
      };
      res.status(HTTP_STATUS.BAD_REQUEST).json(response);
      return;
    }

    // Réponse
    const response: ApiResponse = {
      success: true,
      message: `Conversion ${from} vers ${to} effectuée`,
      data: {
        original: { value: numValue, unit: from },
        converted: { value: Math.round(result * 100) / 100, unit: to },
        formula: `${numValue} ${from} = ${Math.round(result * 100) / 100} ${to}`
      },
      timestamp: new Date().toISOString()
    };

    res.status(HTTP_STATUS.OK).json(response);
  });

  // ============ MÉTHODES PRIVÉES ============

  /**
   * Calculer le coût estimé du carburant
   */
  private calculateFuelCost(distance: number): number {
    const fuelConsumption = 35; // litres/100km pour un camion moyen
    const fuelPrice = 720; // XOF/litre (prix approximatif au Sénégal)
    return Math.round((distance / 100) * fuelConsumption * fuelPrice);
  }

  /**
   * Calculer le coût estimé des péages
   */
  private calculateTollCost(distance: number): number {
    // Estimation basée sur les autoroutes sénégalaises
    const tollPerKm = 15; // XOF/km approximatif
    return Math.round(distance * tollPerKm);
  }

  /**
   * Calculer le coût du chauffeur
   */
  private calculateDriverCost(durationMinutes: number): number {
    const hourlyRate = 2000; // XOF/heure
    const hours = durationMinutes / 60;
    return Math.round(hours * hourlyRate);
  }

  /**
   * Calculer l'empreinte carbone
   */
  private calculateCarbonFootprint(distance: number): number {
    const emissionFactor = 0.8; // kg CO2/km pour un camion
    return Math.round(distance * emissionFactor * 100) / 100;
  }

  /**
   * Générer des insights géographiques
   */
  private generateGeographyInsights(stats: any): string[] {
    const insights: string[] = [];

    if (stats.popularRoutes.length > 0) {
      const topRoute = stats.popularRoutes[0];
      insights.push(`Route la plus fréquentée: ${topRoute._count.id} commandes`);
    }

    if (stats.departureDistribution.length > 0) {
      insights.push(`${stats.departureDistribution.length} régions de départ différentes`);
    }

    insights.push('Analysez ces données pour optimiser votre couverture géographique');

    return insights;
  }
}

// Export de l'instance
export const geolocationController = new GeolocationController();