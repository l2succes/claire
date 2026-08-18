// Bun test configuration for server
export default {
  // Test files pattern
  testMatch: ["**/*.test.ts", "**/*.spec.ts"],
  
  // Coverage configuration
  coverage: true,
  coverageDirectory: "./coverage",
  coverageReporters: ["text", "lcov", "html"],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  
  // Test environment setup
  setupFiles: ["./tests/setup.ts"],
  
  // Timeout for tests
  timeout: 10000,
  
  // Bail on first test failure
  bail: false,
  
  // Enable watch mode
  watchPathIgnorePatterns: ["node_modules", "dist", "coverage"],
};