import { View, Text, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';
import { ClaireMark } from '../../components/claire/mark';
import { colors, mobileType, space, type, useIsDesktopLayout } from '@claire/design-system';

export default function SigninScreen() {
  const insets = useSafeAreaInsets();

  // Stacked on a phone; side by side once there is width to fill. Without the
  // split, a desktop window stretches the two sign-in buttons across the whole
  // viewport and strands the headline in a corner.
  const isDesktop = useIsDesktopLayout();

  const brandPanel = (
    <View style={{ flex: 1, backgroundColor: colors.sky, paddingTop: Math.max(insets.top, space[6]), paddingHorizontal: isDesktop ? space[10] : space[6], paddingBottom: space[8], justifyContent: 'space-between' }}>
      <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
        <ClaireMark size={26} color={colors.ink} dot={colors.paper} />
      </View>
      <View style={{ gap: space[3], paddingBottom: isDesktop ? 0 : space[4] }}>
        <Text style={{ ...mobileType.monoLabel, color: colors.ink }}>WELCOME TO CLAIRE</Text>
        <Text style={{ ...(isDesktop ? type.display : mobileType.display), color: colors.ink }}>Every conversation.{'\n'}One calm place.</Text>
        <Text style={{ ...mobileType.body, color: colors.neutral[600], maxWidth: 320 }}>
          Bring the people you care about together—and let Claire remember what deserves your attention.
        </Text>
      </View>
      {/* Balances the mark against the copy so the block sits optically centred
          rather than pinned to the bottom of a tall window. */}
      {isDesktop ? <View /> : null}
    </View>
  );

  const authPanel = (
    <View style={{ backgroundColor: colors.sky, paddingHorizontal: isDesktop ? space[8] : space[5], paddingTop: space[4], paddingBottom: Math.max(insets.bottom, space[5]), gap: space[2], ...(isDesktop ? { justifyContent: 'center' } : null) }}>
          <GoogleSignInButton mode="signin" variant="welcome" />
          <Pressable
            testID="signin-use-email"
            accessibilityRole="button"
            onPress={() => router.push('/(auth)/email')}
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
        {/* Only the auth column scrolls: revealing the email form must not push
            the brand panel around. */}
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
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        {brandPanel}
        {authPanel}
      </ScrollView>
    </View>
  );
}
