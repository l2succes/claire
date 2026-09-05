// TypeScript resolves this fallback while Metro selects DragRegion.native on
// iOS/Android and DragRegion.web on web. It must re-export a real
// implementation rather than declare a type: if Metro ever resolves this file,
// a declaration-only module yields `undefined` at runtime.
export * from './DragRegion.web';
