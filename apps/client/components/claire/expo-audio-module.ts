export type ExpoAudioModule = typeof import('expo-audio');

// An installed client can briefly lag an OTA update that starts using a native
// module. Keep the route loadable and render a truthful update fallback.
export let expoAudioModule: ExpoAudioModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  expoAudioModule = require('expo-audio') as ExpoAudioModule;
} catch {
  expoAudioModule = null;
}

