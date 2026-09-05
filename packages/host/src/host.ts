// TypeScript resolves this fallback while Metro selects host.native on
// iOS/Android and host.web on web. It re-exports a real implementation so the
// module always has a runtime value, matching services/mobile-cache.ts.
export * from './host.web';
