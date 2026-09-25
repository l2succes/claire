import { render } from '@testing-library/react-native';
import { OnboardingProgress } from '../features/onboarding/onboarding-progress';

describe('OnboardingProgress', () => {
  it.each([
    ['connections', 'Connect accounts, step 1 of 3', 1],
    ['notifications', 'Notifications, step 2 of 3', 2],
    ['plans', 'Plans, step 3 of 3', 3],
  ] as const)('labels the %s stage in the bar variant', (stage, label, step) => {
    const screen = render(<OnboardingProgress stage={stage} />);
    const indicator = screen.getByTestId('onboarding-progress-bar');
    expect(indicator.props.accessibilityLabel).toBe(label);
    expect(indicator.props.accessibilityValue).toEqual({ min: 0, max: 3, now: step });
    expect(screen.getByText(`${step}/3`)).toBeTruthy();
  });

  it('renders the same three stages as compact header dots', () => {
    const screen = render(<OnboardingProgress stage="notifications" variant="dots" />);
    expect(screen.getByTestId('onboarding-progress-dots').props.accessibilityLabel).toBe('Notifications, step 2 of 3');
    expect(screen.getByTestId('onboarding-progress-dot-1')).toBeTruthy();
    expect(screen.getByTestId('onboarding-progress-dot-2')).toBeTruthy();
    expect(screen.getByTestId('onboarding-progress-dot-3')).toBeTruthy();
    expect(screen.queryByTestId('onboarding-progress-fill')).toBeNull();
  });
});
