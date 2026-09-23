import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors, mobileType, space } from '@claire/design-system';
import {
  AuthInlineMessage,
  AuthPrimaryButton,
  AuthScreenShell,
} from './auth-screen-shell';
import { OtpCodeInput } from './otp-code-input';
import { useEmailVerification, type OtpVisualStatus } from './use-email-verification';

export function EmailVerificationView({
  email,
  code,
  error,
  message,
  verificationStatus,
  loading,
  resending,
  focusRequest,
  canVerify,
  autoFocusCode = true,
  onBack,
  onChangeCode,
  onVerify,
  onResend,
  onChangeEmail,
}: {
  email: string;
  code: string;
  error: string | null;
  message: string | null;
  verificationStatus: OtpVisualStatus;
  loading: boolean;
  resending: boolean;
  focusRequest: number;
  canVerify: boolean;
  autoFocusCode?: boolean;
  onBack: () => void;
  onChangeCode: (value: string) => void;
  onVerify: () => void;
  onResend: () => void;
  onChangeEmail: () => void;
}) {
  const busy = loading || resending;

  return (
    <AuthScreenShell
      testID="email-verification-screen"
      kicker="VERIFY YOUR EMAIL"
      title="Enter the 6-digit code."
      description={
        <>
          We sent a code to{' '}
          <Text style={{ fontWeight: '700', color: colors.ink }}>{email || 'your email'}</Text>.
          It may take a few seconds to arrive.
        </>
      }
      onBack={onBack}
      footer={
        <>
          <AuthPrimaryButton
            testID="signin-verify-otp"
            label="Verify & continue"
            loadingLabel="Verifying…"
            loading={loading}
            disabled={!canVerify}
            onPress={onVerify}
          />
          <Pressable
            testID="signin-change-email"
            accessibilityRole="button"
            disabled={busy}
            onPress={onChangeEmail}
            style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text
              style={{ ...mobileType.bodySmall, color: colors.neutral[600], fontWeight: '700' }}
            >
              Change email address
            </Text>
          </Pressable>
        </>
      }
    >
      <View style={{ gap: space[3] }}>
        <Text selectable style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>
          6-DIGIT VERIFICATION CODE
        </Text>
        <OtpCodeInput
          value={code}
          onChange={onChangeCode}
          onSubmit={onVerify}
          disabled={busy}
          status={verificationStatus}
          focusRequest={focusRequest}
          autoFocus={autoFocusCode}
        />
        {error ? (
          <AuthInlineMessage testID="signin-otp-error" tone="error" message={error} />
        ) : null}
        {message ? (
          <AuthInlineMessage testID="signin-otp-message" tone="success" message={message} />
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
          <Text selectable style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
            Didn’t get it?
          </Text>
          <Pressable
            testID="signin-resend-otp"
            accessibilityRole="button"
            accessibilityState={{ busy: resending, disabled: busy }}
            hitSlop={8}
            disabled={busy}
            onPress={onResend}
            style={{
              minHeight: 32,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space[1],
            }}
          >
            {resending ? <ActivityIndicator size="small" color={colors.ink} /> : null}
            <Text
              style={{
                ...mobileType.bodySmall,
                color: busy ? colors.neutral[400] : colors.ink,
                fontWeight: '700',
                textDecorationLine: 'underline',
              }}
            >
              {resending ? 'Sending…' : 'Resend code'}
            </Text>
          </Pressable>
        </View>
      </View>
    </AuthScreenShell>
  );
}

export function EmailVerificationScreen() {
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const routeEmail = Array.isArray(params.email) ? (params.email[0] ?? '') : (params.email ?? '');
  const auth = useEmailVerification(routeEmail);

  return (
    <EmailVerificationView
      email={auth.email}
      code={auth.code}
      error={auth.error}
      message={auth.message}
      verificationStatus={auth.verificationStatus}
      loading={auth.loading}
      resending={auth.resending}
      focusRequest={auth.focusRequest}
      canVerify={auth.canVerify}
      onBack={() => router.back()}
      onChangeCode={auth.setCode}
      onVerify={() => void auth.verify()}
      onResend={() => void auth.resendCode()}
      onChangeEmail={auth.changeEmail}
    />
  );
}
