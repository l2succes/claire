import { describe, expect, it } from 'bun:test';

describe('auth router', () => {
  it('does not expose server-side password sign-in, sign-up or sign-out', async () => {
    const { default: router } = await import('../../src/routes/auth');
    const routes = (router.stack as Array<{ route?: { path: string; methods: Record<string, boolean> } }>)
      .filter((layer) => layer.route)
      .map((layer) => `${Object.keys(layer.route!.methods).join(',').toUpperCase()} ${layer.route!.path}`);
    expect(routes).not.toContain('POST /login');
    expect(routes).not.toContain('POST /signup');
    expect(routes).not.toContain('POST /logout');
    // Sanity check that the router was actually inspected.
    expect(routes).toContain('POST /notify-signup');
  });
});
