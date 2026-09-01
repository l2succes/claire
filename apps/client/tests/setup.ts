// jsdom does not expose these Node/web globals, but application code and its
// dependencies use them freely. Without them a module that merely constructs a
// URLSearchParams fails to load, which reads as a broken test rather than a
// missing environment.
import { TextDecoder, TextEncoder } from 'util';
import { URL as NodeURL, URLSearchParams as NodeURLSearchParams } from 'url';

const globals = globalThis as unknown as Record<string, unknown>;
if (!globals.TextEncoder) globals.TextEncoder = TextEncoder;
if (!globals.TextDecoder) globals.TextDecoder = TextDecoder;
if (!globals.URLSearchParams) globals.URLSearchParams = NodeURLSearchParams;
if (!globals.URL) globals.URL = NodeURL;

import '@testing-library/jest-native/extend-expect';

// Mock expo modules
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: (callback: () => void) => callback(),
  Redirect: () => null,
  Link: ({ children }: any) => children,
  Stack: {
    Screen: () => null,
  },
  Tabs: {
    Screen: () => null,
  },
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  removeNotificationSubscription: jest.fn(),
}));

jest.mock(
  'expo-barcode-scanner',
  () => ({
    BarCodeScanner: {
      requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
      Constants: {
        BarCodeType: {
          qr: 'qr',
        },
      },
    },
  }),
  { virtual: true }
);

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      getSession: jest.fn(),
      refreshSession: jest.fn(),
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
      onAuthStateChange: jest.fn(),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      subscribe: jest.fn(),
    })),
  })),
}));

// Mock NativeWind
jest.mock('nativewind', () => ({
  styled: (component: any) => component,
}));

// Silence console warnings in tests
const originalWarn = console.warn;
beforeAll(() => {
  console.warn = (...args: any[]) => {
    if (
      args[0]?.includes?.('Warning:') ||
      args[0]?.includes?.('ReactNativeFiberHostComponent')
    ) {
      return;
    }
    originalWarn(...args);
  };
});

afterAll(() => {
  console.warn = originalWarn;
});
