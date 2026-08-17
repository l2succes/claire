/**
 * Generate the desktop app icons from the Claire mark.
 *
 * The geometry is the same path `ClaireMark`
 * (apps/client/components/claire/mark.tsx) draws, so the desktop icon cannot
 * drift from the mark used inside the app. Only the palette differs between
 * builds:
 *
 *   production — lime field, ink mark   (matches the iOS/Android icon)
 *   debug      — ink field, lime mark   (obviously different in the Dock, so a
 *                dev build is never mistaken for the real one when both are
 *                running side by side)
 *
 * The PNGs are committed. This script exists to regenerate them, and needs
 * `rsvg-convert` (brew install librsvg), which is not assumed to be present on
 * every machine or in CI.
 *
 *   bun run icons
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILD_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'build');

const SIZE = 1024;
/** ~22% — matches the squircle of the existing iOS/Android icon. */
const CORNER = Math.round(SIZE * 0.219);

type Palette = { field: string; mark: string; dot: string };

const PRODUCTION: Palette = { field: '#DFFF64', mark: '#10120F', dot: '#FFFDF8' };
const DEBUG: Palette = { field: '#10120F', mark: '#DFFF64', dot: '#FFFDF8' };

/**
 * The mark is authored in a 64×64 space and mirrored, exactly as in
 * ClaireMark. Scaling it to ~76% of the canvas leaves the optical margin the
 * existing icon has.
 */
function markGroup(palette: Palette): string {
  const drawn = SIZE * 0.76;
  const scale = drawn / 64;
  const offset = (SIZE - drawn) / 2;

  return `
  <g transform="translate(${offset} ${offset}) scale(${scale})">
    <g transform="translate(64 0) scale(-1 1)">
      <path
        d="M10 34c0-13 9-22 22-22s22 8 22 20-9 20-21 20c-10 0-17-6-17-14 0-7 5-12 12-12 6 0 10 4 10 9 0 6-4 10-10 10"
        fill="none"
        stroke="${palette.mark}"
        stroke-width="7"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx="10" cy="34" r="4" fill="${palette.dot}" />
    </g>
  </g>`;
}

function icon(palette: Palette): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" rx="${CORNER}" ry="${CORNER}" fill="${palette.field}" />${markGroup(palette)}
</svg>
`;
}

function render(name: string, palette: Palette): void {
  const svgPath = join(BUILD_DIR, `${name}.svg`);
  const pngPath = join(BUILD_DIR, `${name}.png`);

  writeFileSync(svgPath, icon(palette));
  try {
    execFileSync('rsvg-convert', ['-w', String(SIZE), '-h', String(SIZE), svgPath, '-o', pngPath]);
  } catch (error) {
    throw new Error(
      `rsvg-convert failed for ${name}. Install it with \`brew install librsvg\`.\n${String(error)}`,
    );
  } finally {
    // The SVG is an intermediate; electron-builder consumes the PNG.
    unlinkSync(svgPath);
  }
  console.log(`wrote build/${name}.png`);
}

mkdirSync(BUILD_DIR, { recursive: true });
render('icon', PRODUCTION);
render('icon-dev', DEBUG);
