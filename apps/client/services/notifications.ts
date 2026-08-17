import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { platformCapabilities } from '../utils/platformCapabilities';
import { supabase, type DbRow } from './supabase';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
const DEVICE_ID_KEY = 'claire.notification.device-id';
let registeredToken: string | null = null;
let activeNotificationChatId: string | undefined;

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

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
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

export async function getNativeNotificationPermission(): Promise<string> {
  if (!platformCapabilities.supportsNativeNotifications) return 'unsupported';
  const permission = await Notifications.getPermissionsAsync();
  return permission.status;
}

async function getDeviceId(): Promise<string> {
  const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (stored) return stored;
  const value = `mobile-${Crypto.randomUUID()}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, value);
  return value;
}

async function authenticatedRequest(path: string, accessToken: string, init: RequestInit, retries = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, ...init.headers },
      });
      if (response.ok || response.status < 500) return response;
      lastError = new Error(`Notification request failed with status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
  }
  throw lastError instanceof Error ? lastError : new Error('Notification request failed');
}

export async function registerNotificationDevice(accessToken: string): Promise<string | null> {
  const token = await setupNotifications();
  if (!token) return null;
  const deviceId = await getDeviceId();
  const response = await authenticatedRequest('/notification-devices', accessToken, {
    method: 'PUT',
    body: JSON.stringify({
      deviceId,
      platform: Platform.OS,
      provider: 'expo',
      token,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      appVersion: Constants.expoConfig?.version,
    }),
  });
  if (!response.ok) throw new Error(`Notification device registration failed with status ${response.status}`);
  registeredToken = token;
  return token;
}

export async function updateNotificationPresence(accessToken: string, state: 'foreground' | 'background', chatId?: string): Promise<void> {
  if (!platformCapabilities.supportsNativeNotifications) return;
  const deviceId = await getDeviceId();
  const response = await authenticatedRequest('/notification-devices/presence', accessToken, {
    method: 'POST',
    body: JSON.stringify({ deviceId, state, chatId: chatId || null }),
  }, 2);
  if (!response.ok && response.status !== 404) throw new Error(`Notification presence failed with status ${response.status}`);
}

export async function deregisterNotificationDevice(accessToken: string): Promise<void> {
  if (!platformCapabilities.supportsNativeNotifications) return;
  const deviceId = await getDeviceId();
  await authenticatedRequest(`/notification-devices/${encodeURIComponent(deviceId)}`, accessToken, { method: 'DELETE' }, 2);
  registeredToken = null;
}

export function addPushTokenRotationListener(accessToken: string) {
  if (!platformCapabilities.supportsNativeNotifications) return { remove: () => undefined };
  return Notifications.addPushTokenListener(() => {
    registerNotificationDevice(accessToken).catch((error) => console.warn('Push token refresh registration failed:', error));
  });
}

export async function syncNotificationBadge(): Promise<void> {
  if (!platformCapabilities.supportsNativeNotifications) return;
  const { data } = await supabase.from('chats').select('unread_count');
  const unread = (data || []).reduce((sum: number, chat: DbRow) => sum + Math.max(0, chat.unread_count || 0), 0);
  await Notifications.setBadgeCountAsync(unread);
}

export function getRegisteredPushToken(): string | null {
  return registeredToken;
}

export function setActiveNotificationChat(chatId?: string): void {
  activeNotificationChatId = chatId;
}

export function getActiveNotificationChat(): string | undefined {
  return activeNotificationChatId;
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
