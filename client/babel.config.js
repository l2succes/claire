module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'nativewind/babel',
      // expo-router/babel is no longer needed in SDK 50+
      // It's included in babel-preset-expo
    ],
  };
};