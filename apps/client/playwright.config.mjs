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
    // A real phone width, so the suites land in the phone layout they were
    // written against. Specs that want the desktop chrome (desktop-shell.spec.mjs)
    // set their own viewport.
    //
    // This was 1024, chosen when `breakpoints.expanded` was 1180. That token is
    // now 900 (packages/tokens/src/index.ts), so 1024 had quietly moved ABOVE
    // the breakpoint: the suite rendered the two-pane desktop shell, which
    // auto-opens the first conversation, so `signIn`'s wait for
    // `messages-screen` timed out and took 49 of 69 tests with it. Pinning a
    // phone width rather than a number just under the breakpoint means the next
    // token change cannot silently do this again.
    viewport: { width: 390, height: 844 },
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
