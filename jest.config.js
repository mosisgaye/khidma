module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src', '<rootDir>/tests'],
    testMatch: [
      '**/__tests__/**/*.+(ts|tsx|js)',
      '**/*.(test|spec).+(ts|tsx|js)'
    ],
    transform: {
      '^.+\\.(ts|tsx)$': 'ts-jest'
    },
    collectCoverageFrom: [
      'src/**/*.{ts,tsx}',
      '!src/**/*.d.ts',
      '!src/app.ts',
      '!src/types/**/*',
      '!src/schemas/**/*'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: [
      'text',
      'lcov',
      'html'
    ],
    setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
    moduleNameMapping: {
      '^@/(.*)$': '<rootDir>/src/$1',
      '^@/config/(.*)$': '<rootDir>/src/config/$1',
      '^@/middleware/(.*)$': '<rootDir>/src/middleware/$1',
      '^@/controllers/(.*)$': '<rootDir>/src/controllers/$1',
      '^@/services/(.*)$': '<rootDir>/src/services/$1',
      '^@/schemas/(.*)$': '<rootDir>/src/schemas/$1',
      '^@/types/(.*)$': '<rootDir>/src/types/$1',
      '^@/utils/(.*)$': '<rootDir>/src/utils/$1'
    },
    globalSetup: '<rootDir>/tests/globalSetup.ts',
    globalTeardown: '<rootDir>/tests/globalTeardown.ts',
    testTimeout: 30000,
    verbose: true,
    forceExit: true,
    clearMocks: true,
    resetMocks: true,
    restoreMocks: true
  };