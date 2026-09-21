import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, mobileType, space, type, useIsDesktopLayout } from '@claire/design-system';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';
import { ClaireMark } from '../../components/claire/mark';

export function WelcomeScreenView({
  googleButton,
  onContinueWithEmail,
}: {
  googleButton: ReactNode;
  onContinueWithEmail: () => void;
}) {
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktopLayout();

  const brandPanel = (
    <View style={{ flex: 1, backgroundColor: colors.sky, paddingTop: Math.max(insets.top, space[6]), paddingHorizontal: isDesktop ? space[10] : space[6], paddingBottom: space[8], justifyContent: 'space-between' }}>
      <View style={{ width: 42, height: 42, borderRadius: 12, borderCurve: 'continuous', backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
        <ClaireMark size={26} color={colors.ink} dot={colors.paper} />
      </View>
      <View style={{ gap: space[3], paddingBottom: isDesktop ? 0 : space[4] }}>
        <Text style={{ ...mobileType.monoLabel, color: colors.ink }}>WELCOME TO CLAIRE</Text>
        <Text style={{ ...(isDesktop ? type.display : mobileType.display), color: colors.ink }}>Every conversation.{'\n'}One calm place.</Text>
        <Text style={{ ...mobileType.body, color: colors.neutral[600], maxWidth: 320 }}>
          Bring the people you care about together—and let Claire remember what deserves your attention.
        </Text>
      </View>
      {isDesktop ? <View /> : null}
    </View>
  );

  const authPanel = (
    <View style={{ backgroundColor: colors.sky, paddingHorizontal: isDesktop ? space[8] : space[5], paddingTop: space[4], paddingBottom: Math.max(insets.bottom, space[5]), gap: space[2], ...(isDesktop ? { justifyContent: 'center' } : null) }}>
      {googleButton}
      <Pressable
        testID="signin-use-email"
        accessibilityRole="button"
        onPress={onContinueWithEmail}
        style={{
          minHeight: 52,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: colors.ink,
          backgroundColor: colors.paper,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>
          Continue with email
        </Text>
      </Pressable>
      <Text style={{ ...mobileType.label, color: colors.neutral[600], textAlign: 'center', marginTop: space[2] }}>
        Your messages are never used to train shared AI models.
      </Text>
    </View>
  );

  if (isDesktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.sky }} testID="signin-screen">
        {brandPanel}
        <ScrollView
          style={{ width: 480, flexGrow: 0, flexShrink: 0, backgroundColor: colors.sky }}
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          keyboardShouldPersistTaps="handled"
        >
          {authPanel}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.sky }} testID="signin-screen">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
        {brandPanel}
        {authPanel}
      </ScrollView>
    </View>
  );
}

export function WelcomeScreen() {
  return (
    <WelcomeScreenView
      googleButton={<GoogleSignInButton mode="signin" variant="welcome" />}
      onContinueWithEmail={() => router.push('/(auth)/email')}
    />
  );
}

export default WelcomeScreen;
