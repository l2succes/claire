import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { platformCapabilities } from '../utils/platformCapabilities';

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
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: 'your-project-id',
    });

    console.log('Push token:', token.data);
    return token.data;
  } catch (error) {
    console.error('Error getting push token:', error);
    return null;
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
