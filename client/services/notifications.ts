import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { platformCapabilities } from '../utils/platformCapabilities';
import { supabase } from './supabase';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

if (platformCapabilities.supportsNativeNotifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

function logWebNoop(method: string) {
  console.info(`[notifications] ${method} is a no-op on web`);
}

/** Browser notifications work while Claire is open. Background web push needs
 * a service worker and VAPID credentials, separate from Expo native push. */
export function supportsWebNotifications(): boolean {
  return platformCapabilities.isWeb && typeof globalThis.Notification !== 'undefined';
}

export async function requestWebNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!supportsWebNotifications()) return 'unsupported';
  return globalThis.Notification.requestPermission();
}

export function notifyWebMessageUpdate(title: string, body: string, data?: Record<string, unknown>): void {
  if (!supportsWebNotifications() || globalThis.Notification.permission !== 'granted') return;
  // The foreground inbox already displays the update; reserve system banners
  // for a backgrounded browser tab.
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
  new globalThis.Notification(title, { body, data });
}

export async function setupNotifications() {
  if (!platformCapabilities.supportsNativeNotifications) {
    logWebNoop('setupNotifications');
    return null;
  }

  if (!Device.isDevice) {
    console.log('Push notifications only work on physical devices');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Failed to get push token for notifications');
    return null;
  }

  try {
    const projectId =
      Constants.easConfig?.projectId ??
      Constants.expoConfig?.extra?.eas?.projectId;

    if (!projectId) {
      console.error('Cannot get Expo push token: EAS project ID is not configured');
      return null;
    }

    const token = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    console.log('Push token:', token.data);
    return token.data;
  } catch (error) {
    console.error('Error getting push token:', error);
    return null;
  }
}

/**
 * Register an Expo push token with the server.
 * No-op on web (graceful).
 */
export async function registerPushToken(token: string): Promise<void> {
  if (!platformCapabilities.supportsNativeNotifications) {
    logWebNoop('registerPushToken');
    return;
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    const response = await fetch(`${API_BASE_URL}/push-tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      throw new Error(`Push token registration failed with status ${response.status}`);
    }
  } catch (error) {
    console.error('Failed to register push token:', error);
  }
}

export function scheduleNotification(
  title: string,
  body: string,
  trigger: Notifications.NotificationTriggerInput
) {
  if (!platformCapabilities.supportsNativeNotifications) {
    logWebNoop('scheduleNotification');
    return Promise.resolve(null);
  }

  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { type: 'whatsapp-reminder' },
    },
    trigger,
  });
}

export function addNotificationListener(
  callback: (notification: Notifications.Notification) => void
) {
  if (!platformCapabilities.supportsNativeNotifications) {
    logWebNoop('addNotificationListener');
    return { remove: () => undefined };
  }

  return Notifications.addNotificationReceivedListener(callback);
}

export function addResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
) {
  if (!platformCapabilities.supportsNativeNotifications) {
    logWebNoop('addResponseListener');
    return { remove: () => undefined };
  }

  return Notifications.addNotificationResponseReceivedListener(callback);
}
