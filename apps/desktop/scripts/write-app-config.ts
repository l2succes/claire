/**
 * Record the endpoints the main process talks to.
 *
 * The renderer is the client's web build, which bakes EXPO_PUBLIC_* values in
 * at export time. The main process needs the same API and Supabase origins,
 * but must not take them from the renderer, so they are resolved here from the
 * client's own env files (the same ones Expo reads) and shipped beside the
 * compiled main process.
 *
 * Usage: bun run scripts/write-app-config.ts [development|production]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseProjectEnv } from '@expo/env';

const DESKTOP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_DIR = join(DESKTOP_DIR, '..', 'client');
const mode = process.argv[2] === 'development' ? 'development' : 'production';

const { env } = parseProjectEnv(CLIENT_DIR, { mode, silent: true });
const config = {
  apiUrl: env.EXPO_PUBLIC_API_URL || 'http://localhost:3001',
  supabaseUrl: env.EXPO_PUBLIC_SUPABASE_URL || null,
};

const target = join(DESKTOP_DIR, 'dist-main', 'app-config.json');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`);
console.log(`▸ Desktop app config (${mode}): API ${new URL(config.apiUrl).origin}`);
