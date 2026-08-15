import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ClaireThemeProvider } from '@claire/design-system';
import * as Sentry from '@sentry/react-native';
import { useAuthStore } from '../stores/authStore';
import {
  addPushTokenRotationListener,
  getActiveNotificationChat,
  registerNotificationDevice,
  updateNotificationPresence,
} from '../services/notifications';
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

export default function RootLayout() {
  const initialize = useAuthStore((state) => state.initialize);
  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    async function init() {
      try {
        await initialize();
      } catch (e) {
        console.error('Init error:', e);
      } finally {
        SplashScreen.hideAsync();
      }
    }
    init();
  }, []);

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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ClaireThemeProvider surface="mobile">
        <QueryClientProvider client={queryClient}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F4F1EA' } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="assistant" options={{ presentation: 'formSheet', sheetGrabberVisible: true, sheetAllowedDetents: [0.7, 1] }} />
            <Stack.Screen name="chat/assistant/[chatId]" options={{ presentation: 'formSheet', sheetGrabberVisible: true, sheetAllowedDetents: [0.7, 1] }} />
          </Stack>
        </QueryClientProvider>
        </ClaireThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
