import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8081',
    trace: 'on-first-retry',
    // Silence browser console noise in CI
    bypassCSP: true,
    // Below `breakpoints.expanded` (1180) from packages/tokens, so the suites
    // land in the phone layout they were written against. Playwright's own
    // default is 1280 wide, which now renders the desktop shell — the specs
    // that want that chrome (desktop-shell.spec.mjs) set their own viewport.
    viewport: { width: 1024, height: 800 },
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'MOCK_BRIDGE=true bunx expo start --web --non-interactive',
        port: 8081,
        reuseExistingServer: true,
        timeout: 120_000,
        env: {
          MOCK_BRIDGE: 'true',
          EXPO_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
          EXPO_PUBLIC_SUPABASE_ANON_KEY: 'mock-anon-key',
          EXPO_PUBLIC_API_URL: 'http://localhost:3001',
        },
      },
});
