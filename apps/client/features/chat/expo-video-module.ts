// Older installed binaries can lack the native module. Keep the chat usable.
export let expoVideoModule: typeof import('expo-video') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  expoVideoModule = require('expo-video') as typeof import('expo-video');
} catch {
  expoVideoModule = null;
}
