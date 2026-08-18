/**
 * Emit css/tokens.css from the TypeScript tokens.
 *
 * Only colors are generated. Everything else the marketing site needs — rem
 * type scales, shadows, transitions, the icon classes — is web-only and lives
 * in css/_web-extras.css, because those concepts have no React Native
 * counterpart and inventing one would be worse than keeping them separate.
 *
 * Run with `bun run generate` from packages/tokens.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { colors } from '../src/index';

// Not `import.meta.dir` — that is Bun-only, and this file is type-checked by tsc.
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** `limeHover` -> `lime-hover`, matching the existing custom-property names. */
function kebab(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function colorVariables(): string[] {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(colors)) {
    if (typeof value === 'string') {
      // Semantic colors keep their bare names; brand colors are namespaced,
      // preserving the names the site already references.
      const semantic = ['success', 'warning', 'danger', 'focus'];
      const name = semantic.includes(key) ? kebab(key) : `claire-${kebab(key)}`;
      lines.push(`  --${name}: ${value.toLowerCase()};`);
    }
  }

  for (const [step, value] of Object.entries(colors.neutral)) {
    lines.push(`  --neutral-${step}: ${String(value).toLowerCase()};`);
  }

  return lines;
}

const generated = [
  '/*',
  ' * GENERATED FILE — DO NOT EDIT.',
  ' *',
  ' * Colors come from packages/tokens/src/index.ts; the rest is appended from',
  ' * packages/tokens/css/_web-extras.css. Regenerate with:',
  ' *   cd packages/tokens && bun run generate',
  ' */',
  '',
  ':root {',
  ...colorVariables(),
  '}',
  '',
].join('\n');

const extras = readFileSync(join(PACKAGE_ROOT, 'css', '_web-extras.css'), 'utf8');
const output = `${generated}\n${extras}`;

writeFileSync(join(PACKAGE_ROOT, 'css', 'tokens.css'), output);
console.log(`generated css/tokens.css (${colorVariables().length} color variables)`);
