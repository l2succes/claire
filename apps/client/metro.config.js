const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);
// The app lives at apps/client, so the workspace root is two levels up.
const workspaceRoot = path.resolve(__dirname, '../..');

const nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Source-only workspace packages. Metro has to watch them (so edits trigger a
// rebuild) and resolve them (so `@claire/*` imports find the TypeScript source
// rather than a build output that does not exist).
const workspacePackages = ['tokens', 'design-system', 'chat-core', 'host', 'shell'];

config.watchFolders = [
  ...(config.watchFolders || []),
  ...workspacePackages.map((name) => path.resolve(workspaceRoot, 'packages', name)),
];
config.resolver.nodeModulesPaths = nodeModulesPaths;
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  ...Object.fromEntries(
    workspacePackages.map((name) => [
      `@claire/${name}`,
      path.resolve(workspaceRoot, 'packages', name),
    ]),
  ),
  react: path.resolve(__dirname, 'node_modules/react'),
  'react-native': path.resolve(__dirname, 'node_modules/react-native'),
};

// Redirect zustand ESM (.mjs) to CJS on web — ESM uses import.meta.env
// which isn't valid in Metro's classic-script bundle.
//
// Find where zustand actually landed rather than assuming the app-local
// `node_modules`: under Bun workspaces it hoists to the repo root, and
// pointing Metro at a path that does not exist fails the whole bundle with
// "Failed to get the SHA-1 for: .../zustand/index.js".
const zustandDir = nodeModulesPaths
  .map((dir) => path.join(dir, 'zustand'))
  .find((dir) => fs.existsSync(path.join(dir, 'index.js')));

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && zustandDir && moduleName.startsWith('zustand')) {
    const mapped = {
      'zustand': 'index.js',
      'zustand/vanilla': 'vanilla.js',
      'zustand/middleware': 'middleware.js',
      'zustand/shallow': 'shallow.js',
      'zustand/traditional': 'traditional.js',
      'zustand/react': 'react.js',
    };
    if (mapped[moduleName]) {
      return {
        filePath: path.join(zustandDir, mapped[moduleName]),
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
