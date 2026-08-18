import { useEffect, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import { Stack, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ClaireThemeProvider } from '@claire/design-system';
import * as Sentry from '@sentry/react-native';
import { useAuthStore } from '../stores/authStore';
import { usePlatformStore } from '../stores/platformStore';
import {
  addPushTokenRotationListener,
  getActiveNotificationChat,
  registerNotificationDevice,
  updateNotificationPresence,
} from '../services/notifications';
import { bootstrapMobileCache, reconcileMobileCache } from '../services/mobile-sync';
import { LaunchReveal } from '../components/LaunchReveal';
import { useInboxRealtime } from '../hooks/useInboxRealtime';
import { useClaireFonts } from '../hooks/useClaireFonts';
import { DesktopChrome } from '../components/desktop/DesktopChrome';
import { useUnreadBadge } from '../hooks/useUnreadBadge';
import { useWorkspaceHandoff } from '../hooks/useWorkspaceHandoff';
import { host } from '@claire/host';
import { API_BASE_URL } from '../services/platforms';
import '../global.css';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 1.0,
  });
}

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 2,
    },
  },
});

function UnreadBadgeBridge() {
  useUnreadBadge();
  return null;
}

function WorkspaceHandoffBridge() {
  useWorkspaceHandoff();
  return null;
}

function DesktopPushBridge() {
  const token = useAuthStore((state) => state.token);
  useEffect(() => {
    if (token && host.name === 'electron') void host.configurePushNotifications({ apiUrl: API_BASE_URL, accessToken: token });
  }, [token]);
  return null;
}

function InboxRealtimeBridge() {
  const userId = useAuthStore((state) => state.user?.id);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  useInboxRealtime(isAuthenticated ? userId : undefined);
  return null;
}

export default function RootLayout() {
  const [initialized, setInitialized] = useState(false);
  // Electron already owns a native startup experience. Replaying the large
  // lime reveal inside its renderer makes desktop feel slower and obscures the
  // workspace after the window is ready, so keep the animation phone-only.
  const [showLaunchReveal, setShowLaunchReveal] = useState(() => host.name !== 'electron');
  // No-op on native, where the expo-font plugin embeds the families at build
  // time. On web and in Electron it registers them, so holding the reveal until
  // it resolves avoids a visible reflow from fallback metrics.
  const fontsReady = useClaireFonts();
  const appReady = initialized && fontsReady;
  const initialize = useAuthStore((state) => state.initialize);
  const token = useAuthStore((state) => state.token);
  const initializePlatforms = usePlatformStore((state) => state.initialize);
  const fetchConnectedSessions = usePlatformStore((state) => state.fetchConnectedSessions);

  useEffect(() => {
    async function init() {
      try {
        await initialize();
      } catch (e) {
        console.error('Init error:', e);
      } finally {
        setInitialized(true);
        // Let React commit the lime handoff surface before the native splash leaves.
        await new Promise<void>((resolve) => setTimeout(resolve, 16));
        await SplashScreen.hideAsync();
      }
    }
    init();
  }, []);

  useEffect(() => {
    if (!token) return;
    void initializePlatforms();
    const userId = useAuthStore.getState().user?.id;
    if (userId) {
      // Native cache hydration happens before individual screens query. A
      // failed cache sync never blocks normal online Supabase behavior.
      void bootstrapMobileCache(userId, token).catch((error) => console.warn('[LocalCache] bootstrap failed', error instanceof Error ? error.message : 'unknown'));
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void fetchConnectedSessions();
        const currentUserId = useAuthStore.getState().user?.id;
        if (currentUserId) void reconcileMobileCache(currentUserId, token).catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [fetchConnectedSessions, initializePlatforms, token]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const register = async () => {
      try {
        const pushToken = await registerNotificationDevice(token);
        if (active && pushToken) await updateNotificationPresence(token, AppState.currentState === 'active' ? 'foreground' : 'background', getActiveNotificationChat());
      } catch (error) {
        console.warn('Notification registration will retry:', error);
      }
    };
    register().catch(() => undefined);
    const retry = setInterval(() => register().catch(() => undefined), 60_000);
    const rotation = addPushTokenRotationListener(token);
    const appState = AppState.addEventListener('change', (state) => {
      updateNotificationPresence(token, state === 'active' ? 'foreground' : 'background', state === 'active' ? getActiveNotificationChat() : undefined).catch(() => undefined);
      if (state === 'active') register().catch(() => undefined);
    });
    const heartbeat = setInterval(() => {
      updateNotificationPresence(token, AppState.currentState === 'active' ? 'foreground' : 'background', getActiveNotificationChat()).catch(() => undefined);
    }, 45_000);
    return () => {
      active = false;
      clearInterval(retry);
      clearInterval(heartbeat);
      rotation.remove();
      appState.remove();
    };
  }, [token]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const openNotification = (notification: Notifications.Notification) => {
      const data = notification.request.content.data as { chatId?: unknown; messageId?: unknown };
      if (typeof data.chatId !== 'string') return;
      router.push({ pathname: '/chat/[chatId]', params: {
        chatId: data.chatId,
        ...(typeof data.messageId === 'string' ? { highlightMessageId: data.messageId } : {}),
      } });
    };
    const last = Notifications.getLastNotificationResponse();
    if (last?.notification) openNotification(last.notification);
    const response = Notifications.addNotificationResponseReceivedListener((event) => openNotification(event.notification));
    return () => response.remove();
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ClaireThemeProvider surface="mobile">
          <QueryClientProvider client={queryClient}>
            <InboxRealtimeBridge />
            <UnreadBadgeBridge />
            <WorkspaceHandoffBridge />
            <DesktopPushBridge />
            <DesktopChrome>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F4F1EA' } }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen
                name="compose"
                options={{
                  presentation: 'formSheet',
                  sheetGrabberVisible: true,
                  sheetAllowedDetents: [1],
                  headerShown: true,
                  headerShadowVisible: false,
                  headerBackVisible: false,
                  headerStyle: { backgroundColor: '#FFFDF8' },
                  contentStyle: { backgroundColor: '#FFFDF8' },
                }}
              />
              <Stack.Screen name="assistant" options={{ presentation: 'formSheet', sheetGrabberVisible: true, sheetAllowedDetents: [0.7, 1] }} />
              <Stack.Screen name="chat/assistant/[chatId]" options={{ presentation: 'formSheet', sheetGrabberVisible: true, sheetAllowedDetents: [0.7, 1] }} />
            </Stack>
            </DesktopChrome>
          </QueryClientProvider>
          </ClaireThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
      {showLaunchReveal ? <LaunchReveal ready={appReady} onFinish={() => setShowLaunchReveal(false)} /> : null}
    </View>
  );
}
