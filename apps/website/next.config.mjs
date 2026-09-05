// SPDX-License-Identifier: Apache-2.0

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  transpilePackages: ['@claire/design-system', '@claire/emails'],
  turbopack: {
    resolveAlias: {
      'react-native': 'react-native-web',
    },
  },
  async rewrites() {
    return [
      {
        // Markdown renditions of every doc, derived at build time from the
        // rendered React tree. Kept for LLM and CLI consumers now that the
        // source of truth is TSX.
        source: '/docs/:path*.md',
        destination: '/docs-markdown/:path*',
      },
    ];
  },
};

export default config;
