#!/usr/bin/env bun

import { existsSync } from 'node:fs';

const required = [
  'LICENSE',
  'LICENSES/AGPL-3.0.txt',
  'LICENSES/Apache-2.0.txt',
  'NOTICE',
  'TRADEMARKS.md',
  'DCO',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
];

const missing = required.filter((path) => !existsSync(path));
if (missing.length > 0) {
  console.error('Missing license/community files:', missing.join(', '));
  process.exit(1);
}

if (existsSync('mobile') && !existsSync('apps/client')) {
  console.error('mobile/ is still present and apps/client/ is missing');
  process.exit(1);
}

console.log('License and path validation passed.');
