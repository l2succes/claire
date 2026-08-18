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
  const plugins = (config.plugins ?? []).map((plugin) => {
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
