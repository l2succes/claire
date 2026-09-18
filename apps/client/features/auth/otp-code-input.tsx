import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { colors, mobileType } from '@claire/design-system';
import { EMAIL_OTP_LENGTH, normalizeOtpCode } from './email-auth-utils';
import type { OtpVisualStatus } from './use-email-verification';

export function OtpCodeInput({
  value,
  onChange,
  onSubmit,
  disabled,
  status,
  focusRequest,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  status: OtpVisualStatus;
  focusRequest: number;
}) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (focusRequest > 0) inputRef.current?.focus();
  }, [focusRequest]);

  const borderColor =
    status === 'success'
      ? colors.success
      : status === 'error'
        ? colors.danger
        : colors.neutral[200];
  const backgroundColor =
    status === 'success'
      ? colors.successSurface
      : status === 'error'
        ? colors.blush
        : colors.paper;

  return (
    <Pressable
      accessible={false}
      disabled={disabled}
      onPress={() => inputRef.current?.focus()}
      style={{ position: 'relative' }}
    >
      <TextInput
        ref={inputRef}
        testID="signin-otp-input"
        accessibilityLabel="6-digit verification code"
        accessibilityHint="Enter the code sent to your email"
        style={{
          position: 'absolute',
          zIndex: 2,
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          opacity: 0.01,
          color: 'transparent',
        }}
        pointerEvents="none"
        value={value}
        onChangeText={(nextValue) => onChange(normalizeOtpCode(nextValue))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmit}
        editable={!disabled}
        autoFocus
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        keyboardType="number-pad"
        maxLength={EMAIL_OTP_LENGTH}
        caretHidden
      />
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: 'row', gap: 6 }}
      >
        {Array.from({ length: EMAIL_OTP_LENGTH }, (_, index) => {
          const character = value[index] ?? '';
          const isActive = focused && status === 'idle' && index === Math.min(value.length, 5);
          return (
            <View
              key={index}
              testID={`signin-otp-box-${index + 1}`}
              style={{
                flex: 1,
                minWidth: 0,
                height: 62,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 14,
                borderCurve: 'continuous',
                borderWidth: isActive ? 2 : 1,
                borderColor: isActive ? colors.ink : borderColor,
                backgroundColor,
                boxShadow: isActive ? `0 0 0 3px ${colors.lime}` : undefined,
              }}
            >
              <Text
                style={{
                  ...mobileType.sectionTitle,
                  color:
                    status === 'success'
                      ? colors.success
                      : status === 'error'
                        ? colors.danger
                        : colors.ink,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {character}
              </Text>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}
