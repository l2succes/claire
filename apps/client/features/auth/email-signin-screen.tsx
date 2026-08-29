import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Mail } from 'lucide-react-native';
import { colors, mobileType, space } from '@claire/design-system';
import {
  AuthInlineMessage,
  AuthPrimaryButton,
  AuthScreenShell,
} from './auth-screen-shell';
import { useEmailSignIn } from './use-email-sign-in';

export function EmailSignInScreen() {
  const auth = useEmailSignIn();
  const [focused, setFocused] = useState(false);

  return (
    <AuthScreenShell
      testID="email-signin-screen"
      kicker="WELCOME BACK"
      title="Sign in with email."
      description="Enter your email and we’ll send you a one-time verification code. No password needed."
      onBack={() => router.back()}
      footer={
        <>
          <AuthPrimaryButton
            testID="signin-send-otp"
            label="Send verification code"
            loadingLabel="Sending code…"
            loading={auth.loading}
            disabled={!auth.canSubmit}
            onPress={() => void auth.sendCode()}
          />
          <Text
            selectable
            style={{ ...mobileType.label, color: colors.neutral[600], textAlign: 'center' }}
          >
            Your messages are never used to train shared AI models.
          </Text>
        </>
      }
    >
      <View style={{ gap: space[2] }}>
        <Text selectable style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>
          EMAIL ADDRESS
        </Text>
        <View
          style={{
            minHeight: 58,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[3],
            paddingHorizontal: space[4],
            borderRadius: 16,
            borderCurve: 'continuous',
            borderWidth: focused || auth.emailInvalid ? 2 : 1,
            borderColor: auth.emailInvalid
              ? colors.danger
              : focused
                ? colors.ink
                : colors.neutral[200],
            backgroundColor: auth.emailInvalid ? colors.blush : colors.paper,
            boxShadow: focused && !auth.emailInvalid ? `0 0 0 3px ${colors.lime}` : undefined,
          }}
        >
          <Mail size={19} color={auth.emailInvalid ? colors.danger : colors.neutral[600]} />
          <TextInput
            testID="signin-email-input"
            accessibilityLabel="Email address"
            style={{
              flex: 1,
              height: 48,
              ...mobileType.body,
              lineHeight: 24,
              paddingTop: 6,
              paddingBottom: 12,
              color: colors.ink,
              textAlignVertical: 'center',
            }}
            placeholder="you@example.com"
            placeholderTextColor={colors.neutral[400]}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="send"
            value={auth.email}
            onChangeText={auth.setEmail}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              auth.validateEmail();
            }}
            onSubmitEditing={() => void auth.sendCode()}
            editable={!auth.loading}
          />
        </View>
        {auth.error ? (
          <AuthInlineMessage testID="signin-email-error" tone="error" message={auth.error} />
        ) : (
          <Text selectable style={{ ...mobileType.bodySmall, color: colors.neutral[400] }}>
            We’ll only use this to sign you in.
          </Text>
        )}
      </View>
    </AuthScreenShell>
  );
}
