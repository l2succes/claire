// TypeScript resolves this fallback while Metro selects billing.native on iOS
// and Android. Web and Electron never load the native StoreKit/Play module.
export * from './billing.web';
