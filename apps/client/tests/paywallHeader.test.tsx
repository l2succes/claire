import { fireEvent, render } from '@testing-library/react-native';
import { PaywallHeader } from '../features/billing/paywall-components';
import { paywallExitAction, paywallHeaderMode } from '../features/billing/paywall-navigation';

describe('PaywallHeader', () => {
  it('shows the onboarding close control', () => {
    const onClose = jest.fn();
    const screen = render(<PaywallHeader mode="onboarding" onClose={onClose} />);

    expect(screen.getByLabelText('Close plans')).toBeTruthy();
    expect(screen.queryByLabelText('Back to Profile')).toBeNull();
    expect(screen.getByTestId('onboarding-progress-bar')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Close plans'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a leading back button when opened from Profile', () => {
    const onClose = jest.fn();
    const screen = render(<PaywallHeader mode="profile" onClose={onClose} />);

    expect(screen.getByText('Subscriptions')).toBeTruthy();
    expect(screen.queryByLabelText('Close plans')).toBeNull();
    expect(screen.queryByTestId('onboarding-progress-bar')).toBeNull();
    fireEvent.press(screen.getByLabelText('Back to Profile'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('returns Profile paywalls to Profile and onboarding paywalls to Claire', () => {
    expect(paywallHeaderMode('settings')).toBe('profile');
    expect(paywallExitAction('settings', true)).toBe('back');
    expect(paywallExitAction('settings', false)).toBe('/settings');
    expect(paywallHeaderMode('onboarding')).toBe('onboarding');
    expect(paywallExitAction('onboarding', false)).toBe('/(tabs)/dashboard');
    expect(paywallHeaderMode('credits')).toBe('modal');
  });
});
