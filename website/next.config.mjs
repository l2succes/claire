import createMDX from '@next/mdx';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const withMDX = createMDX({});
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default withMDX({
  pageExtensions: ['ts', 'tsx', 'md', 'mdx'],
  turbopack: {
    root: repositoryRoot,
  },
});
