module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      // Tamagui's optimizing compiler. It partially evaluates styled()
      // components and hoists their styles, flattening them to plain views on
      // native and atomic CSS on web. Tamagui also runs correctly without it,
      // so if a build ever misbehaves this line can be removed to isolate it.
      [
        "@tamagui/babel-plugin",
        {
          components: ["@claire/design-system", "tamagui"],
          config: "./tamagui.config.ts",
          logTimings: false,
          disableExtraction: process.env.NODE_ENV === "development",
        },
      ],
      // Reanimated's plugin has to stay last; it rewrites worklets and expects
      // to see the final AST.
      'react-native-reanimated/plugin',
    ],
  };
};
