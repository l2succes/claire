const staging = process.env.APP_VARIANT === 'staging' || process.env.APP_VARIANT === 'preview';
const development = process.env.APP_VARIANT === 'development';

function identifier() {
  if (staging) return 'com.claire.app.staging';
  if (development) return 'com.claire.app.dev';
  return 'com.claire.app';
}

function appName() {
  if (staging) return 'Claire Staging';
  if (development) return 'Claire Dev';
  return 'Claire';
}

module.exports = ({ config }) => {
  // The dev launcher is startup cost in a build that can never use it.
  //
  // Only the `development` EAS profile sets `developmentClient: true`, but the
  // plugin was applied to every variant, so the launcher was linked into
  // staging and production binaries and initialised on every cold start there.
  // Measured on a release simulator build, ~3.6s of cold start happens before
  // JavaScript begins executing at all (once running, the app paints Home from
  // cache in 156ms), and the launcher is one of the few things in that window
  // that is pure waste outside development.
  const plugins = (config.plugins ?? [])
    .filter((plugin) => development || plugin !== 'expo-dev-client')
    .map((plugin) => {
      if (plugin === 'expo-dev-client') {
        return ['expo-dev-client', { addGeneratedScheme: development }];
      }

      return plugin;
    });

  return {
    ...config,
    name: appName(),
    scheme: staging ? 'claire-staging' : development ? 'claire-dev' : 'claire',
    plugins,
    ios: {
      ...config.ios,
      bundleIdentifier: identifier(),
      infoPlist: {
        ...config.ios?.infoPlist,
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      ...config.android,
      package: identifier(),
    },
  };
};
