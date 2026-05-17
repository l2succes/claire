const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Redirect zustand ESM (.mjs) to CJS on web — ESM uses import.meta.env
// which isn't valid in Metro's classic-script bundle.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName.startsWith('zustand')) {
    const mapped = {
      'zustand': 'zustand/index.js',
      'zustand/vanilla': 'zustand/vanilla.js',
      'zustand/middleware': 'zustand/middleware.js',
      'zustand/shallow': 'zustand/shallow.js',
      'zustand/traditional': 'zustand/traditional.js',
      'zustand/react': 'zustand/react.js',
    };
    if (mapped[moduleName]) {
      return {
        filePath: path.resolve(__dirname, 'node_modules', mapped[moduleName]),
        type: 'sourceFile',
      };
    }
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });