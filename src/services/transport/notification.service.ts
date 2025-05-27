import { NotificationType, NotificationCategory } from '@prisma/client';
import prisma from '@/config/database';
import { redisUtils } from '@/config/redis';

// ============ SERVICE NOTIFICATIONS TRANSPORT ============

export class TransportNotificationService {

  // ============ TYPES DE NOTIFICATIONS ============

  /**
   * Notifier une nouvelle commande aux transporteurs
   */
  async notifyNewOrder(orderId: string): Promise<void> {
    const order = await prisma.transportOrder.findUnique({
      where: { id: orderId },
      include: {
        expediteur: {
          include: { user: true }
        },
        departureAddress: true,
        destinationAddress: true
      }
    });

    if (!order) return;

    // Trouver les transporteurs pertinents
    const suitableTransporteurs = await this.findSuitableTransporteurs(order);

    // Créer les notifications
    for (const transporteur of suitableTransporteurs) {
      await this.createNotification({
        userId: transporteur.userId,
        type: NotificationType.PUSH,
        category: NotificationCategory.TRANSPORT,
        title: 'Nouvelle commande disponible',
        message: `Transport ${order.departureAddress.city} → ${order.destinationAddress.city}`,
        data: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          route: `${order.departureAddress.city} → ${order.destinationAddress.city}`,
          weight: order.weight,
          goodsType: order.goodsType,
          departureDate: order.departureDate,
          estimatedPrice: order.basePrice
        },
        priority: order.priority === 'URGENT' ? 'HIGH' : 'NORMAL'
      });
    }

    // Notification temps réel via WebSocket/SSE
    await this.sendRealtimeNotification('new-order', {
      orderId: order.id,
      route: `${order.departureAddress.city} → ${order.destinationAddress.city}`,
      weight: order.weight,
      goodsType: order.goodsType
    });
  }

  /**
   * Notifier l'envoi d'un devis
   */
  async notifyQuoteSent(quoteId: string): Promise<void> {
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: {
        transportOrder: {
          include: {
            expediteur: { include: { user: true } },
            departureAddress: true,
            destinationAddress: true
          }
        },
        transporteur: {
          include: { user: true }
        }
      }
    });

    if (!quote) return;

    const order = quote.transportOrder;
    const expediteur = order.expediteur;

    // Notification à l'expéditeur
    await this.createNotification({
      userId: expediteur.userId,
      type: NotificationType.PUSH,
      category: NotificationCategory.TRANSPORT,
      title: 'Nouveau devis reçu',
      message: `Devis de ${quote.transporteur.companyName || quote.transporteur.user.firstName} pour ${quote.totalPrice.toLocaleString()} XOF`,
      data: {
        quoteId: quote.id,
        quoteNumber: quote.quoteNumber,
        orderId: order.id,
        orderNumber: order.orderNumber,
        transporteurName: quote.transporteur.companyName || `${quote.transporteur.user.firstName} ${quote.transporteur.user.lastName}`,
        totalPrice: quote.totalPrice,
        validUntil: quote.validUntil
      },
      priority: 'NORMAL'
    });

    // Email de notification
    await this.sendEmailNotification({
      to: expediteur.user.email,
      subject: `Nouveau devis pour votre commande ${order.orderNumber}`,
      template: 'quote-received',
      data: {
        expediteurName: `${expediteur.user.firstName} ${expediteur.user.lastName}`,
        orderNumber: order.orderNumber,
        transporteurName: quote.transporteur.companyName || `${quote.transporteur.user.firstName} ${quote.transporteur.user.lastName}`,
        totalPrice: quote.totalPrice,
        route: `${order.departureAddress.city} → ${order.destinationAddress.city}`,
        validUntil: quote.validUntil
      }
    });
  }

  /**
   * Notifier l'acceptation d'un devis
   */
  async notifyQuoteAccepted(quoteId: string): Promise<void> {
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: {
        transportOrder: {
          include: {
            expediteur: { include: { user: true } },
            departureAddress: true,
            destinationAddress: true
          }
        },
        transporteur: {
          include: { user: true }
        }
      }
    });

    if (!quote) return;

    const order = quote.transportOrder;

    // Notification au transporteur
    await this.createNotification({
      userId: quote.transporteur.userId,
      type: NotificationType.PUSH,
      category: NotificationCategory.TRANSPORT,
      title: 'Devis accepté ! 🎉',
      message: `Votre devis de ${quote.totalPrice.toLocaleString()} XOF a été accepté`,
      data: {
        quoteId: quote.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalPrice: quote.totalPrice,
        expediteurName: `${order.expediteur.user.firstName} ${order.expediteur.user.lastName}`,
        route: `${order.departureAddress.city} → ${order.destinationAddress.city}`,
        departureDate: order.departureDate
      },
      priority: 'HIGH'
    });

    // SMS pour urgence
    if (order.priority === 'URGENT') {
      await this.sendSMSNotification({
        to: quote.transporteur.user.phone,
        message: `URGENT: Votre devis ${quote.quoteNumber} a été accepté. Commande ${order.orderNumber} - ${quote.totalPrice.toLocaleString()} XOF`
      });
    }
  }

  /**
   * Notifier le début d'une commande
   */
  async notifyOrderStarted(orderId: string): Promise<void> {
    const order = await prisma.transportOrder.findUnique({
      where: { id: orderId },
      include: {
        expediteur: { include: { user: true } },
        transporteur: { include: { user: true } },
        departureAddress: true,
        destinationAddress: true,
        vehicle: true
      }
    });

    if (!order || !order.transporteur) return;

    // Notification à l'expéditeur
    await this.createNotification({
      userId: order.expediteur.userId,
      type: NotificationType.PUSH,
      category: NotificationCategory.TRANSPORT,
      title: 'Transport démarré',
      message: `${order.transporteur.user.firstName} a commencé le transport de votre commande`,
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        transporteurName: `${order.transporteur.user.firstName} ${order.transporteur.user.lastName}`,
        transporteurPhone: order.transporteur.user.phone,
        vehicleInfo: order.vehicle ? `${order.vehicle.brand} ${order.vehicle.model} (${order.vehicle.plateNumber})` : null,
        estimatedArrival: order.deliveryDate
      },
      priority: 'NORMAL'
    });

    // Notification de rappel au transporteur
    await this.createNotification({
      userId: order.transporteur.userId,
      type: NotificationType.IN_APP,
      category: NotificationCategory.TRANSPORT,
      title: 'Transport en cours',
      message: 'N\'oubliez pas de mettre à jour votre position régulièrement',
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        reminder: true
      },
      priority: 'LOW'
    });
  }

  /**
   * Notifier l'approche de la destination
   */
  async notifyNearDestination(orderId: string, distanceRemaining: number): Promise<void> {
    const order = await prisma.transportOrder.findUnique({
      where: { id: orderId },
      include: {
        expediteur: { include: { user: true } },
        transporteur: { include: { user: true } },
        destinationAddress: true
      }
    });

    if (!order || !order.transporteur) return;

    const eta = Math.round(distanceRemaining / 50 * 60); // Estimation en minutes

    // Notification à l'expéditeur
    await this.createNotification({
      userId: order.expediteur.userId,
      type: NotificationType.PUSH,
      category: NotificationCategory.TRANSPORT,
      title: 'Livraison imminente',
      message: `Le transporteur arrive dans environ ${eta} minutes`,
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        distanceRemaining,
        estimatedArrival: eta,
        transporteurPhone: order.transporteur.user.phone,
        destinationAddress: `${order.destinationAddress.street}, ${order.destinationAddress.city}`
      },
      priority: 'HIGH'
    });

    // SMS au contact de livraison si différent
    if (order.destinationContact && order.destinationContact !== order.expediteur.user.phone) {
      await this.sendSMSNotification({
        to: order.destinationContact,
        message: `Livraison commande ${order.orderNumber} dans ${eta}min. Transporteur: ${order.transporteur.user.phone}`
      });
    }
  }

  /**
   * Notifier la livraison
   */
  async notifyDelivery(orderId: string): Promise<void> {
    const order = await prisma.transportOrder.findUnique({
      where: { id: orderId },
      include: {
        expediteur: { include: { user: true } },
        transporteur: { include: { user: true } }
      }
    });

    if (!order || !order.transporteur) return;

    // Notification à l'expéditeur
    await this.createNotification({
      userId: order.expediteur.userId,
      type: NotificationType.PUSH,
      category: NotificationCategory.TRANSPORT,
      title: 'Livraison effectuée ✅',
      message: 'Votre commande a été livrée avec succès',
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        deliveredAt: new Date(),
        canRate: true,
        transporteurId: order.transporteur.id
      },
      priority: 'NORMAL'
    });

    // Notification au transporteur
    await this.createNotification({
      userId: order.transporteur.userId,
      type: NotificationType.PUSH,
      category: NotificationCategory.TRANSPORT,
      title: 'Mission accomplie ! 🎉',
      message: `Commande ${order.orderNumber} livrée avec succès`,
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        completedAt: new Date(),
        earnings: order.totalPrice
      },
      priority: 'NORMAL'
    });
  }

  /**
   * Notifier un retard
   */
  async notifyDelay(orderId: string, reason: string, newEta?: Date): Promise<void> {
    const order = await prisma.transportOrder.findUnique({
      where: { id: orderId },
      include: {
        expediteur: { include: { user: true } },
        transporteur: { include: { user: true } }
      }
    });

    if (!order || !order.transporteur) return;

    // Notification à l'expéditeur
    await this.createNotification({
      userId: order.expediteur.userId,
      type: NotificationType.PUSH,
      category: NotificationCategory.TRANSPORT,
      title: 'Retard signalé',
      message: `Retard pour la commande ${order.orderNumber}: ${reason}`,
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        delayReason: reason,
        newEta: newEta,
        transporteurPhone: order.transporteur.user.phone
      },
      priority: 'HIGH'
    });
  }

  /**
   * Notifier les rappels de maintenance
   */
  async notifyMaintenanceReminder(vehicleId: string): Promise<void> {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: {
        transporteur: { include: { user: true } }
      }
    });

    if (!vehicle) return;

    const daysUntilMaintenance = vehicle.nextMaintenance 
      ? Math.ceil((vehicle.nextMaintenance.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
      : null;

    await this.createNotification({
      userId: vehicle.transporteur.userId,
      type: NotificationType.PUSH,
      category: NotificationCategory.TRANSPORT,
      title: 'Maintenance requise',
      message: daysUntilMaintenance 
        ? `Maintenance du véhicule ${vehicle.plateNumber} dans ${daysUntilMaintenance} jours`
        : `Maintenance du véhicule ${vehicle.plateNumber} en retard`,
      data: {
        vehicleId: vehicle.id,
        plateNumber: vehicle.plateNumber,
        maintenanceType: 'scheduled',
        daysUntilMaintenance,
        isOverdue: daysUntilMaintenance ? daysUntilMaintenance < 0 : false
      },
      priority: daysUntilMaintenance && daysUntilMaintenance < 7 ? 'HIGH' : 'MEDIUM'
    });
  }

  // ============ GESTION DES NOTIFICATIONS ============

  /**
   * Créer une notification
   */
  async createNotification(data: {
    userId: string;
    type: NotificationType;
    category: NotificationCategory;
    title: string;
    message: string;
    data?: any;
    priority?: string;
  }): Promise<void> {
    await prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        category: data.category,
        title: data.title,
        message: data.message,
        data: data.data || {},
        priority: data.priority || 'NORMAL'
      }
    });

    // Mettre en cache pour les notifications temps réel
    await this.cacheNotificationForUser(data.userId);
  }

  /**
   * Marquer les notifications comme lues
   */
  async markNotificationsAsRead(userId: string, notificationIds?: string[]): Promise<void> {
    const whereCondition: any = { userId };
    
    if (notificationIds && notificationIds.length > 0) {
      whereCondition.id = { in: notificationIds };
    }

    await prisma.notification.updateMany({
      where: whereCondition,
      data: {
        read: true,
        readAt: new Date()
      }
    });

    await this.cacheNotificationForUser(userId);
  }

  /**
   * Obtenir les notifications d'un utilisateur
   */
  async getUserNotifications(
    userId: string,
    filters: {
      unreadOnly?: boolean;
      category?: NotificationCategory;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{
    notifications: any[];
    unreadCount: number;
    pagination: any;
  }> {
    const { page = 1, limit = 20, unreadOnly = false, category } = filters;
    const skip = (page - 1) * limit;

    const whereCondition: any = { userId };
    
    if (unreadOnly) {
      whereCondition.read = false;
    }
    
    if (category) {
      whereCondition.category = category;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.notification.count({ where: whereCondition }),
      prisma.notification.count({ 
        where: { userId, read: false }
      })
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      notifications,
      unreadCount,
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
   * Supprimer les anciennes notifications
   */
  async cleanupOldNotifications(): Promise<void> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    await prisma.notification.deleteMany({
      where: {
        createdAt: { lt: thirtyDaysAgo },
        read: true
      }
    });
  }

  // ============ MÉTHODES PRIVÉES ============

  /**
   * Trouver les transporteurs adaptés à une commande
   */
  private async findSuitableTransporteurs(order: any): Promise<any[]> {
    const weightInTons = order.weight / 1000;

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
        user: { select: { id: true } }
      },
      take: 50 // Limiter pour éviter le spam
    });
  }

  /**
   * Mettre en cache les notifications pour un utilisateur
   */
  private async cacheNotificationForUser(userId: string): Promise<void> {
    const unreadCount = await prisma.notification.count({
      where: { userId, read: false }
    });

    await redisUtils.setWithExpiry(
      `notifications:${userId}:unread_count`,
      unreadCount.toString(),
      3600 // 1 heure
    );
  }

  /**
   * Envoyer une notification temps réel
   */
  private async sendRealtimeNotification(event: string, data: any): Promise<void> {
    // TODO: Implémenter avec WebSocket ou Server-Sent Events
    console.log(`Notification temps réel: ${event}`, data);
  }

  /**
   * Envoyer un email
   */
  private async sendEmailNotification(data: {
    to: string;
    subject: string;
    template: string;
    data: any;
  }): Promise<void> {
    // TODO: Implémenter avec un service d'email (SendGrid, AWS SES, etc.)
    console.log(`Email à ${data.to}: ${data.subject}`);
  }

  /**
   * Envoyer un SMS
   */
  private async sendSMSNotification(data: {
    to: string | null | undefined;
    message: string;
  }): Promise<void> {
    if (!data.to) return;
    
    // TODO: Implémenter avec un service SMS (Twilio, Orange API, etc.)
    console.log(`SMS à ${data.to}: ${data.message}`);
  }

  // ============ NOTIFICATIONS PROGRAMMÉES ============

  /**
   * Programmer des rappels automatiques
   */
  async scheduleReminders(): Promise<void> {
    // Rappels de maintenance
    await this.scheduleMaintenanceReminders();
    
    // Rappels de devis expirés
    await this.scheduleQuoteExpirationReminders();
    
    // Rappels de commandes non assignées
    await this.scheduleUnassignedOrderReminders();
  }

  /**
   * Programmer les rappels de maintenance
   */
  private async scheduleMaintenanceReminders(): Promise<void> {
    const vehiclesNeedingMaintenance = await prisma.vehicle.findMany({
      where: {
        isActive: true,
        nextMaintenance: {
          lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 jours
        }
      }
    });

    for (const vehicle of vehiclesNeedingMaintenance) {
      await this.notifyMaintenanceReminder(vehicle.id);
    }
  }

  /**
   * Programmer les rappels de devis expirés
   */
  private async scheduleQuoteExpirationReminders(): Promise<void> {
    const expiringQuotes = await prisma.quote.findMany({
      where: {
        status: 'ENVOYE',
        validUntil: {
          lte: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 heures
        }
      },
      include: {
        transportOrder: {
          include: {
            expediteur: { include: { user: true } }
          }
        },
        transporteur: { include: { user: true } }
      }
    });

    for (const quote of expiringQuotes) {
      // Notification à l'expéditeur
      await this.createNotification({
        userId: quote.transportOrder.expediteur.userId,
        type: NotificationType.PUSH,
        category: NotificationCategory.TRANSPORT,
        title: 'Devis expire bientôt',
        message: `Le devis de ${quote.transporteur.companyName || quote.transporteur.user.firstName} expire dans 24h`,
        data: {
          quoteId: quote.id,
          orderId: quote.transportOrderId,
          validUntil: quote.validUntil,
          totalPrice: quote.totalPrice
        },
        priority: 'MEDIUM'
      });
    }
  }

  /**
   * Programmer les rappels de commandes non assignées
   */
  private async scheduleUnassignedOrderReminders(): Promise<void> {
    const oldUnassignedOrders = await prisma.transportOrder.findMany({
      where: {
        status: 'DEMANDE',
        transporteurId: null,
        createdAt: {
          lte: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 heures
        }
      },
      include: {
        expediteur: { include: { user: true } }
      }
    });

    for (const order of oldUnassignedOrders) {
      await this.createNotification({
        userId: order.expediteur.userId,
        type: NotificationType.PUSH,
        category: NotificationCategory.TRANSPORT,
        title: 'Commande sans transporteur',
        message: `Votre commande ${order.orderNumber} n'a pas encore de transporteur assigné`,
        data: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          suggestion: 'Considérez ajuster le prix ou les conditions'
        },
        priority: 'MEDIUM'
      });
    }
  }
}

// Export de l'instance
export const transportNotificationService = new TransportNotificationService();