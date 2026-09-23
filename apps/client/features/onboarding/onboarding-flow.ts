import AsyncStorage from '@react-native-async-storage/async-storage';
import { platformCapabilities } from '../../utils/platformCapabilities';
import { notificationOnboardingRoute, shouldShowNotificationStep } from './notification-step';

const PAYWALL_STEP_KEY_PREFIX = 'claire.onboarding.paywall.v1';

export const onboardingHomeRoute = '/(tabs)/dashboard';
export const onboardingPaywallRoute = '/paywall?source=onboarding';

function paywallStepKey(userId: string) {
  return `${PAYWALL_STEP_KEY_PREFIX}:${userId}`;
}

export async function hasCompletedOnboardingPaywall(userId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(paywallStepKey(userId))) === '1';
}

export async function completeOnboardingPaywall(userId: string): Promise<void> {
  await AsyncStorage.setItem(paywallStepKey(userId), '1');
}

/** Mobile onboarding ends at plans even while billing enforcement is disabled. */
export async function nextOnboardingRoute(
  userId?: string,
  options: { skipNotificationStep?: boolean } = {},
): Promise<string> {
  if (!userId || !platformCapabilities.supportsNativeNotifications) return onboardingHomeRoute;
  if (!options.skipNotificationStep && await shouldShowNotificationStep(userId)) return notificationOnboardingRoute;
  if (!(await hasCompletedOnboardingPaywall(userId))) return onboardingPaywallRoute;
  return onboardingHomeRoute;
}
