import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNativeNotificationPermission } from '../../services/notifications';
import { platformCapabilities } from '../../utils/platformCapabilities';

const STEP_KEY_PREFIX = 'claire.onboarding.notifications.v1';

export const notificationOnboardingRoute = '/(auth)/notifications';

function stepKey(userId: string) {
  return `${STEP_KEY_PREFIX}:${userId}`;
}

export async function hasCompletedNotificationStep(userId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(stepKey(userId))) === '1';
}

export async function completeNotificationStep(userId: string): Promise<void> {
  await AsyncStorage.setItem(stepKey(userId), '1');
}

export async function shouldShowNotificationStep(userId?: string): Promise<boolean> {
  if (!platformCapabilities.supportsNativeNotifications || !userId) return false;
  const permission = await getNativeNotificationPermission();
  if (permission === 'granted') return false;
  return !(await hasCompletedNotificationStep(userId));
}
