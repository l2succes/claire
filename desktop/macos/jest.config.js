module.exports = {
  preset: 'react-native',
  // The shared workspace packages ship raw TypeScript with no build step, so
  // they must be transformed rather than treated as opaque node_modules. Mirrors
  // the allow-list in mobile/jest.config.js.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native(-macos)?|@react-native(-community)?)/.*|@claire/.*)',
  ],
};
