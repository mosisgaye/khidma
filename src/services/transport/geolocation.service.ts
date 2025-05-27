import { Coordinates, DistanceMatrix } from '@/types/transport.types';
import prisma from '@/config/database';

// ============ SERVICE GÉOLOCALISATION ============

export class GeolocationService {

  // ============ CALCUL DE DISTANCES ============

  /**
   * Calculer la distance entre deux coordonnées GPS
   */
  calculateDistance(departure: Coordinates, destination: Coordinates): DistanceMatrix {
    const distance = this.haversineDistance(departure, destination);
    
    // Estimation de la durée basée sur la vitesse moyenne (60 km/h en ville, 80 km/h sur route)
    const averageSpeed = distance > 50 ? 80 : 60; // km/h
    const duration = Math.round((distance / averageSpeed) * 60); // en minutes

    return {
      departure,
      destination,
      distance: Math.round(distance * 100) / 100, // arrondi à 2 décimales
      duration
    };
  }

  /**
   * Calculer la distance Haversine entre deux points GPS
   */
  private haversineDistance(coord1: Coordinates, coord2: Coordinates): number {
    const R = 6371; // Rayon de la Terre en kilomètres
    const dLat = this.degreesToRadians(coord2.latitude - coord1.latitude);
    const dLon = this.degreesToRadians(coord2.longitude - coord1.longitude);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.degreesToRadians(coord1.latitude)) * 
              Math.cos(this.degreesToRadians(coord2.latitude)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Convertir des degrés en radians
   */
  private degreesToRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  // ============ RECHERCHE GÉOGRAPHIQUE ============

  /**
   * Trouver les adresses dans un rayon donné
   */
  async findAddressesInRadius(
    centerCoords: Coordinates,
    radiusKm: number,
    limit: number = 50
  ): Promise<any[]> {
    // Calcul approximatif des bornes de latitude/longitude
    const latDelta = radiusKm / 111; // Approximation: 1 degré lat ≈ 111 km
    const lonDelta = radiusKm / (111 * Math.cos(this.degreesToRadians(centerCoords.latitude)));

    const minLat = centerCoords.latitude - latDelta;
    const maxLat = centerCoords.latitude + latDelta;
    const minLon = centerCoords.longitude - lonDelta;
    const maxLon = centerCoords.longitude + lonDelta;

    const addresses = await prisma.address.findMany({
      where: {
        latitude: {
          gte: minLat,
          lte: maxLat
        },
        longitude: {
          gte: minLon,
          lte: maxLon
        },
        isActive: true
      },
      take: limit * 2, // Prendre plus pour filtrer ensuite
      select: {
        id: true,
        street: true,
        city: true,
        region: true,
        latitude: true,
        longitude: true,
        user: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      }
    });

    // Filtrer par distance exacte et trier
    return addresses
      .map(address => {
        if (!address.latitude || !address.longitude) return null;
        
        const distance = this.haversineDistance(
          centerCoords,
          { latitude: address.latitude, longitude: address.longitude }
        );

        return {
          ...address,
          distance: Math.round(distance * 100) / 100
        };
      })
      .filter(address => address && address.distance <= radiusKm)
      .sort((a, b) => a!.distance - b!.distance)
      .slice(0, limit);
  }

  /**
   * Calculer la distance entre deux adresses stockées
   */
  async calculateDistanceBetweenAddresses(
    departureAddressId: string,
    destinationAddressId: string
  ): Promise<DistanceMatrix | null> {
    const addresses = await prisma.address.findMany({
      where: {
        id: { in: [departureAddressId, destinationAddressId] }
      },
      select: {
        id: true,
        latitude: true,
        longitude: true
      }
    });

    if (addresses.length !== 2) {
      return null;
    }

    const departure = addresses.find(a => a.id === departureAddressId);
    const destination = addresses.find(a => a.id === destinationAddressId);

    if (!departure?.latitude || !destination?.latitude) {
      return null;
    }

    return this.calculateDistance(
      { latitude: departure.latitude, longitude: departure.longitude },
      { latitude: destination.latitude, longitude: destination.longitude }
    );
  }

  // ============ GÉOCODAGE SIMPLE ============

  /**
   * Obtenir les coordonnées approximatives d'une ville sénégalaise
   */
  async getCityCoordinates(cityName: string, regionName?: string): Promise<Coordinates | null> {
    const whereCondition: any = {
      name: {
        contains: cityName,
        mode: 'insensitive'
      }
    };

    if (regionName) {
      whereCondition.regionCode = await this.getRegionCode(regionName);
    }

    const city = await prisma.city.findFirst({
      where: whereCondition,
      select: {
        latitude: true,
        longitude: true
      }
    });

    if (!city?.latitude || !city?.longitude) {
      return null;
    }

    return {
      latitude: city.latitude,
      longitude: city.longitude
    };
  }

  /**
   * Obtenir le code d'une région
   */
  private async getRegionCode(regionName: string): Promise<string | undefined> {
    const region = await prisma.region.findFirst({
      where: {
        name: {
          contains: regionName,
          mode: 'insensitive'
        }
      },
      select: { code: true }
    });

    return region?.code;
  }

  // ============ OPTIMISATION D'ITINÉRAIRES ============

  /**
   * Calculer l'itinéraire optimisé pour plusieurs points (TSP simple)
   */
  calculateOptimizedRoute(waypoints: Coordinates[]): {
    optimizedOrder: number[];
    totalDistance: number;
    estimatedDuration: number;
  } {
    if (waypoints.length <= 2) {
      return {
        optimizedOrder: waypoints.map((_, index) => index),
        totalDistance: waypoints.length === 2 ? 
          this.haversineDistance(waypoints[0], waypoints[1]) : 0,
        estimatedDuration: waypoints.length === 2 ? 
          Math.round(this.haversineDistance(waypoints[0], waypoints[1]) / 60 * 60) : 0
      };
    }

    // Algorithme du plus proche voisin (simple mais efficace pour peu de points)
    const visited = new Set<number>();
    const route = [0]; // Commencer par le premier point
    visited.add(0);
    let currentPoint = 0;
    let totalDistance = 0;

    while (route.length < waypoints.length) {
      let nearestPoint = -1;
      let nearestDistance = Infinity;

      for (let i = 0; i < waypoints.length; i++) {
        if (!visited.has(i)) {
          const distance = this.haversineDistance(waypoints[currentPoint], waypoints[i]);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestPoint = i;
          }
        }
      }

      if (nearestPoint !== -1) {
        route.push(nearestPoint);
        visited.add(nearestPoint);
        totalDistance += nearestDistance;
        currentPoint = nearestPoint;
      }
    }

    const averageSpeed = totalDistance > 100 ? 80 : 60; // km/h
    const estimatedDuration = Math.round((totalDistance / averageSpeed) * 60);

    return {
      optimizedOrder: route,
      totalDistance: Math.round(totalDistance * 100) / 100,
      estimatedDuration
    };
  }

  // ============ ZONES GÉOGRAPHIQUES ============

  /**
   * Vérifier si un point est dans une zone géographique
   */
  isPointInRegion(point: Coordinates, regionName: string): Promise<boolean> {
    // Implémentation simplifiée basée sur les régions du Sénégal
    const regionBounds: Record<string, {
      north: number;
      south: number;
      east: number;
      west: number;
    }> = {
      'Dakar': { north: 14.8, south: 14.6, east: -17.3, west: -17.5 },
      'Thiès': { north: 15.0, south: 14.6, east: -16.7, west: -17.0 },
      'Saint-Louis': { north: 16.2, south: 15.8, east: -16.3, west: -16.6 },
      // Ajouter d'autres régions si nécessaire
    };

    const bounds = regionBounds[regionName];
    if (!bounds) {
      return Promise.resolve(false);
    }

    const isInBounds = point.latitude >= bounds.south &&
                      point.latitude <= bounds.north &&
                      point.longitude >= bounds.west &&
                      point.longitude <= bounds.east;

    return Promise.resolve(isInBounds);
  }

  // ============ STATISTIQUES GÉOGRAPHIQUES ============

  /**
   * Obtenir les statistiques de distribution géographique des commandes
   */
  async getTransportGeographyStats(): Promise<any> {
    // Statistiques par région de départ
    const departureStats = await prisma.transportOrder.groupBy({
      by: ['departureAddress'],
      _count: { id: true }
    });

    // Statistiques par région de destination
    const destinationStats = await prisma.transportOrder.groupBy({
      by: ['destinationAddress'],
      _count: { id: true }
    });

    // Routes les plus populaires
    const popularRoutes = await prisma.transportOrder.groupBy({
      by: ['departureAddress', 'destinationAddress'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10
    });

    return {
      departureDistribution: departureStats,
      destinationDistribution: destinationStats,
      popularRoutes: popularRoutes,
      totalOrders: departureStats.reduce((sum, stat) => sum + stat._count.id, 0)
    };
  }

  // ============ CONVERSION D'UNITÉS ============

  /**
   * Convertir des kilomètres en milles
   */
  kmToMiles(km: number): number {
    return km * 0.621371;
  }

  /**
   * Convertir des milles en kilomètres
   */
  milesToKm(miles: number): number {
    return miles * 1.60934;
  }

  /**
   * Calculer le temps de trajet basé sur la distance et conditions
   */
  calculateTravelTime(
    distance: number,
    vehicleType: string = 'CAMION_10T',
    trafficCondition: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM'
  ): number {
    // Vitesses moyennes selon le type de véhicule (km/h)
    const vehicleSpeeds: Record<string, number> = {
      'CAMION_3T': 70,
      'CAMION_5T': 65,
      'CAMION_10T': 60,
      'CAMION_20T': 55,
      'CAMION_35T': 50,
      'REMORQUE': 45,
      'SEMI_REMORQUE': 45,
      'FOURGON': 75,
      'BENNE': 60,
      'CITERNE': 50
    };

    // Facteurs de trafic
    const trafficFactors = {
      'LOW': 1.0,
      'MEDIUM': 1.2,
      'HIGH': 1.5
    };

    const baseSpeed = vehicleSpeeds[vehicleType] || 60;
    const adjustedSpeed = baseSpeed / trafficFactors[trafficCondition];
    
    return Math.round((distance / adjustedSpeed) * 60); // en minutes
  }
}

// Export de l'instance
export const geolocationService = new GeolocationService();