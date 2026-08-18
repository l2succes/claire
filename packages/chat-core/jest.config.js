/**
 * Plain ts-jest, deliberately not the react-native preset: this package holds
 * only pure logic so both clients (and, if ever needed, the server) can import
 * it without dragging in a React Native runtime.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
};
