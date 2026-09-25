import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getNativeNotificationPermission } from '../services/notifications';
import { OnboardingNotificationsView } from '../features/onboarding/onboarding-notifications-screen';
import { completeNotificationStep, shouldShowNotificationStep } from '../features/onboarding/notification-step';
import {
  completeOnboardingPaywall,
  nextOnboardingRoute,
  onboardingHomeRoute,
  onboardingPaywallRoute,
} from '../features/onboarding/onboarding-flow';

jest.mock('../services/notifications', () => ({
  getNativeNotificationPermission: jest.fn(),
  registerNotificationDevice: jest.fn(),
  requestNativeNotificationPermission: jest.fn(),
}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

const permission = getNativeNotificationPermission as jest.MockedFunction<typeof getNativeNotificationPermission>;
const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 59, bottom: 34, left: 0, right: 0 },
};

function renderNotificationStep(props: React.ComponentProps<typeof OnboardingNotificationsView>) {
  return render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <OnboardingNotificationsView {...props} />
    </SafeAreaProvider>,
  );
}

describe('notification onboarding', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    permission.mockResolvedValue('undetermined');
  });

  it('explains why alerts help and offers a real Not now path', () => {
    const onEnable = jest.fn();
    const onSkip = jest.fn();
    const screen = renderNotificationStep({ permission: 'undetermined', onEnable, onSkip, onBack: jest.fn() });

    expect(screen.getByText('The right things, right on time.')).toBeTruthy();
    expect(screen.getByText(/New messages when they arrive/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('onboarding-notifications-enable'));
    fireEvent.press(screen.getByTestId('onboarding-notifications-skip'));
    expect(onEnable).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('shows a settings path after permission was denied', () => {
    const screen = renderNotificationStep({ permission: 'denied', onEnable: jest.fn(), onSkip: jest.fn(), onBack: jest.fn() });
    expect(screen.getByText('Open device settings')).toBeTruthy();
    expect(screen.getByText('Not now')).toBeTruthy();
  });

  it('shows the step once per person unless permission is already granted', async () => {
    await expect(shouldShowNotificationStep('person-1')).resolves.toBe(true);
    await completeNotificationStep('person-1');
    await expect(shouldShowNotificationStep('person-1')).resolves.toBe(false);
    await expect(shouldShowNotificationStep('person-2')).resolves.toBe(true);
    permission.mockResolvedValue('granted');
    await expect(shouldShowNotificationStep('person-2')).resolves.toBe(false);
  });

  it('visits notifications, then plans, then the app only once per person', async () => {
    await expect(nextOnboardingRoute('person-1')).resolves.toBe('/(auth)/notifications');
    await completeNotificationStep('person-1');
    await expect(nextOnboardingRoute('person-1')).resolves.toBe(onboardingPaywallRoute);
    await completeOnboardingPaywall('person-1');
    await expect(nextOnboardingRoute('person-1')).resolves.toBe(onboardingHomeRoute);

    permission.mockResolvedValue('granted');
    await expect(nextOnboardingRoute('person-2')).resolves.toBe(onboardingPaywallRoute);
    await expect(nextOnboardingRoute(undefined)).resolves.toBe(onboardingHomeRoute);
  });
});
