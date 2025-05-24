import { PrismaClient, UserRole, UserStatus, VehicleType, VehicleStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Démarrage du seeding de la base de données...');

  // ============ RÉGIONS ET VILLES DU SÉNÉGAL ============
  const regions = [
    { name: 'Dakar', code: 'DK', latitude: 14.6937, longitude: -17.4441 },
    { name: 'Thiès', code: 'TH', latitude: 14.7886, longitude: -16.9282 },
    { name: 'Saint-Louis', code: 'SL', latitude: 16.0283, longitude: -16.4898 },
    { name: 'Diourbel', code: 'DI', latitude: 14.6519, longitude: -16.2296 },
    { name: 'Louga', code: 'LG', latitude: 15.6181, longitude: -16.2463 },
    { name: 'Tambacounda', code: 'TC', latitude: 13.7671, longitude: -13.6675 },
    { name: 'Kaolack', code: 'KL', latitude: 14.1618, longitude: -16.0713 },
    { name: 'Matam', code: 'MT', latitude: 15.6554, longitude: -13.2554 },
    { name: 'Fatick', code: 'FK', latitude: 14.3347, longitude: -16.4061 },
    { name: 'Kafrine', code: 'KF', latitude: 14.1059, longitude: -15.5565 },
    { name: 'Kédougou', code: 'KD', latitude: 12.5561, longitude: -12.1753 },
    { name: 'Kolda', code: 'KO', latitude: 12.8939, longitude: -14.9406 },
    { name: 'Sédhiou', code: 'SE', latitude: 12.7081, longitude: -15.5571 },
    { name: 'Ziguinchor', code: 'ZG', latitude: 12.5681, longitude: -16.2736 }
  ];

  for (const region of regions) {
    await prisma.region.upsert({
      where: { code: region.code },
      update: {},
      create: region
    });
  }

  const cities = [
    // Dakar
    { name: 'Dakar', regionCode: 'DK', latitude: 14.6937, longitude: -17.4441 },
    { name: 'Pikine', regionCode: 'DK', latitude: 14.7549, longitude: -17.3983 },
    { name: 'Guédiawaye', regionCode: 'DK', latitude: 14.7692, longitude: -17.4103 },
    { name: 'Rufisque', regionCode: 'DK', latitude: 14.7167, longitude: -17.2667 },
    
    // Thiès
    { name: 'Thiès', regionCode: 'TH', latitude: 14.7886, longitude: -16.9282 },
    { name: 'Mbour', regionCode: 'TH', latitude: 14.4198, longitude: -16.9597 },
    { name: 'Tivaouane', regionCode: 'TH', latitude: 14.9503, longitude: -16.8217 },
    
    // Saint-Louis
    { name: 'Saint-Louis', regionCode: 'SL', latitude: 16.0283, longitude: -16.4898 },
    { name: 'Dagana', regionCode: 'SL', latitude: 16.5167, longitude: -15.5000 },
    { name: 'Podor', regionCode: 'SL', latitude: 16.6500, longitude: -14.9667 },
    
    // Autres villes importantes
    { name: 'Touba', regionCode: 'DI', latitude: 14.8500, longitude: -15.8833 },
    { name: 'Kaolack', regionCode: 'KL', latitude: 14.1618, longitude: -16.0713 },
    { name: 'Ziguinchor', regionCode: 'ZG', latitude: 12.5681, longitude: -16.2736 },
    { name: 'Tambacounda', regionCode: 'TC', latitude: 13.7671, longitude: -13.6675 }
  ];

  for (const city of cities) {
    await prisma.city.upsert({
      where: { name_regionCode: { name: city.name, regionCode: city.regionCode } },
      update: {},
      create: city
    });
  }

  // ============ UTILISATEUR ADMIN ============
  const hashedPassword = await bcrypt.hash('Admin123!', 12);
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@khidmaservice.com' },
    update: {},
    create: {
      email: 'admin@khidmaservice.com',
      password: hashedPassword,
      phone: '+221771234567',
      firstName: 'Admin',
      lastName: 'Khidma',
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      phoneVerified: true
    }
  });

  // ============ CATÉGORIES DE PIÈCES DÉTACHÉES ============
  const categories = [
    {
      name: 'Moteur',
      slug: 'moteur',
      description: 'Pièces pour le moteur et ses composants'
    },
    {
      name: 'Transmission',
      slug: 'transmission',
      description: 'Boîtes de vitesses, embrayages, différentiels'
    },
    {
      name: 'Freinage',
      slug: 'freinage',
      description: 'Plaquettes, disques, étriers de frein'
    },
    {
      name: 'Suspension',
      slug: 'suspension',
      description: 'Amortisseurs, ressorts, rotules'
    },
    {
      name: 'Électrique',
      slug: 'electrique',
      description: 'Batteries, alternateurs, démarreurs'
    },
    {
      name: 'Filtration',
      slug: 'filtration',
      description: 'Filtres à air, huile, carburant'
    },
    {
      name: 'Pneumatiques',
      slug: 'pneumatiques',
      description: 'Pneus et jantes pour tous véhicules'
    },
    {
      name: 'Carrosserie',
      slug: 'carrosserie',
      description: 'Pare-chocs, phares, rétroviseurs'
    }
  ];

  for (let i = 0; i < categories.length; i++) {
    await prisma.category.upsert({
      where: { slug: categories[i].slug },
      update: {},
      create: {
        ...categories[i],
        sortOrder: i + 1
      }
    });
  }

  // ============ MARQUES AUTOMOBILES ============
  const brands = [
    { name: 'Mercedes-Benz', slug: 'mercedes-benz', country: 'Allemagne' },
    { name: 'Volvo', slug: 'volvo', country: 'Suède' },
    { name: 'Scania', slug: 'scania', country: 'Suède' },
    { name: 'MAN', slug: 'man', country: 'Allemagne' },
    { name: 'Iveco', slug: 'iveco', country: 'Italie' },
    { name: 'Renault Trucks', slug: 'renault-trucks', country: 'France' },
    { name: 'DAF', slug: 'daf', country: 'Pays-Bas' },
    { name: 'Isuzu', slug: 'isuzu', country: 'Japon' },
    { name: 'Mitsubishi Fuso', slug: 'mitsubishi-fuso', country: 'Japon' },
    { name: 'Ford', slug: 'ford', country: 'États-Unis' }
  ];

  for (const brand of brands) {
    await prisma.brand.upsert({
      where: { slug: brand.slug },
      update: {},
      create: brand
    });
  }

  // ============ TYPES D'ASSURANCE ============
  const insuranceTypes = [
    {
      name: 'Responsabilité Civile',
      slug: 'responsabilite-civile',
      description: 'Assurance obligatoire couvrant les dommages causés aux tiers',
      shortDescription: 'Couverture des dommages aux tiers',
      basePrice: 150000,
      features: [
        'Dommages corporels aux tiers',
        'Dommages matériels aux tiers',
        'Défense pénale et recours'
      ],
      coverageDetails: {
        maxCoverage: 1000000000,
        deductible: 0,
        territorialCoverage: 'CEDEAO'
      }
    },
    {
      name: 'Tous Risques',
      slug: 'tous-risques',
      description: 'Couverture complète incluant vol, incendie, bris de glace',
      shortDescription: 'Protection complète du véhicule',
      basePrice: 350000,
      features: [
        'Responsabilité civile',
        'Vol et tentative de vol',
        'Incendie et explosion',
        'Bris de glace',
        'Catastrophes naturelles',
        'Assistance dépannage'
      ],
      coverageDetails: {
        maxCoverage: 2000000000,
        deductible: 50000,
        territorialCoverage: 'CEDEAO'
      }
    },
    {
      name: 'Assurance Marchandise',
      slug: 'assurance-marchandise',
      description: 'Protection des marchandises transportées',
      shortDescription: 'Couverture des marchandises',
      basePrice: 75000,
      features: [
        'Vol de marchandises',
        'Dommages en cours de transport',
        'Avaries particulières',
        'Frais de sauvetage'
      ],
      coverageDetails: {
        maxCoverage: 500000000,
        deductible: 25000,
        territorialCoverage: 'CEDEAO'
      }
    }
  ];

  for (let i = 0; i < insuranceTypes.length; i++) {
    await prisma.insuranceType.upsert({
      where: { slug: insuranceTypes[i].slug },
      update: {},
      create: {
        ...insuranceTypes[i],
        sortOrder: i + 1
      }
    });
  }

  // ============ PARAMÈTRES SYSTÈME ============
  const settings = [
    // Général
    { category: 'GENERAL', key: 'app_name', value: 'Khidma Service', type: 'STRING', description: 'Nom de l\'application' },
    { category: 'GENERAL', key: 'app_version', value: '1.0.0', type: 'STRING', description: 'Version de l\'application' },
    { category: 'GENERAL', key: 'default_language', value: 'fr', type: 'STRING', description: 'Langue par défaut' },
    { category: 'GENERAL', key: 'default_currency', value: 'XOF', type: 'STRING', description: 'Devise par défaut' },
    { category: 'GENERAL', key: 'timezone', value: 'Africa/Dakar', type: 'STRING', description: 'Fuseau horaire' },
    
    // Transport
    { category: 'TRANSPORT', key: 'base_price', value: '25000', type: 'NUMBER', description: 'Prix de base transport (XOF)' },
    { category: 'TRANSPORT', key: 'price_per_km', value: '150', type: 'NUMBER', description: 'Prix par kilomètre (XOF)' },
    { category: 'TRANSPORT', key: 'price_per_ton', value: '5000', type: 'NUMBER', description: 'Prix par tonne (XOF)' },
    { category: 'TRANSPORT', key: 'commission_rate', value: '0.05', type: 'NUMBER', description: 'Commission transport (5%)' },
    { category: 'TRANSPORT', key: 'max_search_radius', value: '100', type: 'NUMBER', description: 'Rayon de recherche max (km)' },
    
    // E-commerce
    { category: 'ECOMMERCE', key: 'shipping_fee', value: '2500', type: 'NUMBER', description: 'Frais de livraison (XOF)' },
    { category: 'ECOMMERCE', key: 'free_shipping_threshold', value: '50000', type: 'NUMBER', description: 'Seuil livraison gratuite (XOF)' },
    { category: 'ECOMMERCE', key: 'commission_rate', value: '0.15', type: 'NUMBER', description: 'Commission boutique (15%)' },
    { category: 'ECOMMERCE', key: 'return_period', value: '7', type: 'NUMBER', description: 'Période de retour (jours)' },
    
    // Paiement
    { category: 'PAYMENT', key: 'vat_rate', value: '0.18', type: 'NUMBER', description: 'Taux TVA Sénégal (18%)' },
    { category: 'PAYMENT', key: 'payment_timeout', value: '900', type: 'NUMBER', description: 'Timeout paiement (secondes)' },
    { category: 'PAYMENT', key: 'wave_enabled', value: 'true', type: 'BOOLEAN', description: 'Wave Money activé' },
    { category: 'PAYMENT', key: 'orange_money_enabled', value: 'true', type: 'BOOLEAN', description: 'Orange Money activé' },
    { category: 'PAYMENT', key: 'stripe_enabled', value: 'true', type: 'BOOLEAN', description: 'Stripe activé' },
    
    // Notifications
    { category: 'NOTIFICATION', key: 'email_enabled', value: 'true', type: 'BOOLEAN', description: 'Notifications email' },
    { category: 'NOTIFICATION', key: 'sms_enabled', value: 'true', type: 'BOOLEAN', description: 'Notifications SMS' },
    { category: 'NOTIFICATION', key: 'push_enabled', value: 'true', type: 'BOOLEAN', description: 'Notifications push' },
    
    // Sécurité
    { category: 'SECURITY', key: 'max_login_attempts', value: '5', type: 'NUMBER', description: 'Tentatives de connexion max' },
    { category: 'SECURITY', key: 'account_lockout_duration', value: '900', type: 'NUMBER', description: 'Durée blocage compte (secondes)' },
    { category: 'SECURITY', key: 'password_min_length', value: '8', type: 'NUMBER', description: 'Longueur min mot de passe' },
    { category: 'SECURITY', key: 'jwt_expiry', value: '86400', type: 'NUMBER', description: 'Expiration JWT (secondes)' },
    { category: 'SECURITY', key: 'rate_limit_requests', value: '100', type: 'NUMBER', description: 'Limite requêtes par heure' }
  ];

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { category_key: { category: setting.category, key: setting.key } },
      update: {},
      create: setting
    });
  }

  console.log('✅ Seeding terminé avec succès !');
  console.log(`
📊 Données créées :
- ${regions.length} régions du Sénégal
- ${cities.length} villes principales
- 1 utilisateur administrateur
- ${categories.length} catégories de produits
- ${brands.length} marques automobiles
- ${insuranceTypes.length} types d'assurance
- ${settings.length} paramètres système
  `);
}

main()
  .catch((e) => {
    console.error('❌ Erreur lors du seeding :', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });