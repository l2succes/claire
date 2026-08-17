const path = require('path');

// These packages are pinned to a single copy so React and React Native are not
// instantiated twice. Resolve them instead of hardcoding `<rootDir>/node_modules`:
// under Bun workspaces most of them hoist to the repo root, and hardcoded paths
// made every suite fail to load with "Could not locate module react-native".
const entry = (name) => require.resolve(name, { paths: [__dirname] });
const packageDir = (name) =>
  path.dirname(require.resolve(`${name}/package.json`, { paths: [__dirname] }));

module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|@sentry/.*|native-base|react-native-svg|react-native-gesture-handler|react-native-screens|react-native-safe-area-context|@react-native-async-storage/async-storage|react-native-reanimated|nativewind|lucide-react-native|@claire/.*|@tamagui/.*|tamagui)',
  ],
  collectCoverageFrom: [
    '**/*.{ts,tsx}',
    '!**/coverage/**',
    '!**/node_modules/**',
    '!**/babel.config.js',
    '!**/jest.config.js',
    '!**/metro.config.js',
    '!**/.expo/**',
    '!**/tailwind.config.js',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^react$': entry('react'),
    '^react-native$': entry('react-native'),
    '^react-native-css-interop/(.*)$': `${packageDir('react-native-css-interop')}/$1`,
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testEnvironment: 'jsdom',
  // Tamagui's package exports map `browser` to ESM (.mjs) and `require` to CJS.
  // Under jsdom Jest picks `browser` by default and then chokes on the import
  // statement, so ask for the CommonJS build the CJS test runner can load.
  testEnvironmentOptions: {
    customExportConditions: ['require', 'node'],
  },
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};
