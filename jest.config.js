/** @type {import('jest').Config} */
module.exports = {
  // Utiliser ts-jest pour transformer les fichiers TypeScript
  preset: 'ts-jest',
  
  // Environnement de test
  testEnvironment: 'node',
  
  // Racine du projet
  rootDir: './',
  
  // Dossiers des tests
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/tests/**/*.spec.ts',
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/src/**/*.spec.ts'
  ],
  
  // Configuration ts-jest
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json'
    }]
  },
  
  // Extensions de fichiers à traiter
  moduleFileExtensions: ['ts', 'js', 'json'],
  
  // Alias de chemin (même que tsconfig.json)
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/config/(.*)$': '<rootDir>/src/config/$1',
    '^@/middleware/(.*)$': '<rootDir>/src/middleware/$1',
    '^@/controllers/(.*)$': '<rootDir>/src/controllers/$1',
    '^@/services/(.*)$': '<rootDir>/src/services/$1',
    '^@/schemas/(.*)$': '<rootDir>/src/schemas/$1',
    '^@/types/(.*)$': '<rootDir>/src/types/$1',
    '^@/utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@/routes/(.*)$': '<rootDir>/src/routes/$1'
  },
  
  // Fichier de configuration global pour les tests
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  
  // Ignorer ces dossiers
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/coverage/'
  ],
  
  // Collecte de couverture
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts'
  ],
  
  // Dossier de sortie pour la couverture
  coverageDirectory: 'coverage',
  
  // Formats de rapport de couverture
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Seuils de couverture
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  
  // Nettoyage automatique des mocks
  clearMocks: true,
  
  // Affichage détaillé
  verbose: true,
  
  // Timeout par défaut (30 secondes)
  testTimeout: 30000
};