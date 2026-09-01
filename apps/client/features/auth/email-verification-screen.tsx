import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors, mobileType, space } from '@claire/design-system';
import {
  AuthInlineMessage,
  AuthPrimaryButton,
  AuthScreenShell,
} from './auth-screen-shell';
import { OtpCodeInput } from './otp-code-input';
import { useEmailVerification } from './use-email-verification';

export function EmailVerificationScreen() {
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const routeEmail = Array.isArray(params.email) ? (params.email[0] ?? '') : (params.email ?? '');
  const auth = useEmailVerification(routeEmail);
  const busy = auth.loading || auth.resending;

  return (
    <AuthScreenShell
      testID="email-verification-screen"
      kicker="VERIFY YOUR EMAIL"
      title="Enter the 6-digit code."
      description={
        <>
          We sent a code to{' '}
          <Text style={{ fontWeight: '700', color: colors.ink }}>{auth.email || 'your email'}</Text>.
          It may take a few seconds to arrive.
        </>
      }
      onBack={() => router.back()}
      footer={
        <>
          <AuthPrimaryButton
            testID="signin-verify-otp"
            label="Verify & continue"
            loadingLabel="Verifying…"
            loading={auth.loading}
            disabled={!auth.canVerify}
            onPress={() => void auth.verify()}
          />
          <Pressable
            testID="signin-change-email"
            accessibilityRole="button"
            disabled={busy}
            onPress={auth.changeEmail}
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
          value={auth.code}
          onChange={auth.setCode}
          onSubmit={() => void auth.verify()}
          disabled={busy}
          status={auth.verificationStatus}
          focusRequest={auth.focusRequest}
        />
        {auth.error ? (
          <AuthInlineMessage testID="signin-otp-error" tone="error" message={auth.error} />
        ) : null}
        {auth.message ? (
          <AuthInlineMessage testID="signin-otp-message" tone="success" message={auth.message} />
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
          <Text selectable style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
            Didn’t get it?
          </Text>
          <Pressable
            testID="signin-resend-otp"
            accessibilityRole="button"
            accessibilityState={{ busy: auth.resending, disabled: busy }}
            hitSlop={8}
            disabled={busy}
            onPress={() => void auth.resendCode()}
            style={{
              minHeight: 32,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space[1],
            }}
          >
            {auth.resending ? <ActivityIndicator size="small" color={colors.ink} /> : null}
            <Text
              style={{
                ...mobileType.bodySmall,
                color: busy ? colors.neutral[400] : colors.ink,
                fontWeight: '700',
                textDecorationLine: 'underline',
              }}
            >
              {auth.resending ? 'Sending…' : 'Resend code'}
            </Text>
          </Pressable>
        </View>
      </View>
    </AuthScreenShell>
  );
}
