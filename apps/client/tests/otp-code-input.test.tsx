import React, { useState } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { colors } from '@claire/design-system';
import { OtpCodeInput } from '../features/auth/otp-code-input';
import type { OtpVisualStatus } from '../features/auth/use-email-verification';

function OtpHarness({ status = 'idle' }: { status?: OtpVisualStatus }) {
  const [value, setValue] = useState('');
  return (
    <OtpCodeInput
      value={value}
      onChange={setValue}
      onSubmit={jest.fn()}
      disabled={false}
      status={status}
      focusRequest={0}
    />
  );
}

describe('OtpCodeInput', () => {
  it('distributes a pasted value across six visual boxes and removes non-digits', () => {
    const screen = render(<OtpHarness />);

    fireEvent.changeText(screen.getByTestId('signin-otp-input'), '12a-34 5678');

    ['1', '2', '3', '4', '5', '6'].forEach((digit) => {
      expect(screen.getByText(digit, { includeHiddenElements: true })).toBeTruthy();
    });
    expect(screen.queryByText('7', { includeHiddenElements: true })).toBeNull();
  });

  it('uses green borders and a light green surface after verification succeeds', () => {
    const screen = render(<OtpHarness status="success" />);

    expect(screen.getByTestId('signin-otp-box-1', { includeHiddenElements: true })).toHaveStyle({
      borderColor: colors.success,
      backgroundColor: colors.successSurface,
    });
  });

  it('uses red borders and a soft red surface when the code is rejected', () => {
    const screen = render(<OtpHarness status="error" />);

    expect(screen.getByTestId('signin-otp-box-1', { includeHiddenElements: true })).toHaveStyle({
      borderColor: colors.danger,
      backgroundColor: colors.blush,
    });
  });
});
