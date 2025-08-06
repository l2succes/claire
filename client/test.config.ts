// Bun test configuration for client
export default {
  // Test files pattern
  testMatch: ["**/*.test.tsx", "**/*.test.ts", "**/*.spec.tsx", "**/*.spec.ts"],
  
  // Coverage configuration
  coverage: true,
  coverageDirectory: "./coverage",
  coverageReporters: ["text", "lcov", "html"],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
  
  // Test environment setup
  setupFiles: ["./tests/setup.ts"],
  
  // Timeout for tests
  timeout: 10000,
  
  // Bail on first test failure
  bail: false,
  
  // Enable watch mode
  watchPathIgnorePatterns: ["node_modules", "dist", "coverage", ".expo"],
  
  // Mock modules
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^~/(.*)$": "<rootDir>/$1",
  },
};