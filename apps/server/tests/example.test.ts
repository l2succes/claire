/**
 * Trivial sanity-check tests — replaced by the supertest route smoke tests
 * in tests/routes/routes.test.ts (issue #13).
 */

describe('Server sanity checks', () => {
  it('bun/jest globals are available', () => {
    expect(true).toBe(true);
  });

  it('basic arithmetic', () => {
    expect(1 + 1).toBe(2);
  });

  it('async/await works', async () => {
    const val = await Promise.resolve(42);
    expect(val).toBe(42);
  });
});
