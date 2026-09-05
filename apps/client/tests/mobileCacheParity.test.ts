/**
 * Metro picks mobile-cache.native on phones and mobile-cache.web in Electron and
 * the browser, while TypeScript only ever sees the web file. A function added to
 * one and forgotten in the other therefore type-checks cleanly and then throws
 * "not a function" on the surface nobody was looking at.
 */
import fs from 'fs';

function exportedNames(relativePath: string): string[] {
  const source = fs.readFileSync(require.resolve(relativePath), 'utf8');
  return [...source.matchAll(/^export (?:async )?function (\w+)/gm)].map((match) => match[1]).sort();
}

describe('mobile cache module parity', () => {
  it('exports the same functions from the native and web implementations', () => {
    const native = exportedNames('../services/mobile-cache.native');
    const web = exportedNames('../services/mobile-cache.web');

    expect(web).toEqual(expect.arrayContaining(native));
    expect(native).toEqual(expect.arrayContaining(web));
  });
});
