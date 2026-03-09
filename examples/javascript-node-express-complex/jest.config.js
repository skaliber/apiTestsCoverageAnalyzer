/**
 * jest.config.js
 * Jest configuration for the logistics tracking API test suite.
 */
/** @type {import('jest').Config} */
module.exports = {
  // Use Node.js environment (no jsdom needed for backend)
  testEnvironment: 'node',

  // Discover tests in tests/ subdirectories
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
  ],

  // Skip test helpers from test discovery
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/tests/helpers/',
  ],

  // Verbose output shows individual test names
  verbose: true,

  // Collect coverage from src files when --coverage flag is passed
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',   // pure entry-point, not testable in isolation
  ],

  coverageDirectory: 'coverage',

  coverageReporters: ['text', 'lcov', 'html'],

  // Coverage thresholds (enforced with npm test -- --coverage in CI)
  coverageThreshold: {
    global: {
      lines:      80,
      functions:  80,
      branches:   70,
      statements: 80,
    },
  },

  // Reset module registry between test files to avoid store bleed-through
  // (Individual test files call resetStore() in beforeEach instead)
  restoreMocks: true,

  // Show how long slow tests take
  slowTestThreshold: 2000,

  // Prevent tests from running in parallel if they share in-memory state
  // (set maxWorkers=1 or use --runInBand when running against a live server)
  // maxWorkers: 1,
};
