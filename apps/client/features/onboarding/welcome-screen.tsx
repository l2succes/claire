import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { colors, mobileType, space, type, useIsDesktopLayout } from '@claire/design-system';
import { ClaireMark } from '../../components/claire/mark';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';
import { OnboardingReveal } from './onboarding-reveal';
import { useOnboardingMotion } from './use-onboarding-motion';
import { WelcomeCarousel } from './welcome-carousel';
import { WELCOME_HEADLINE, WELCOME_SCENES } from './welcome-scenes';
import { LegalConsent } from '../legal/legal-consent';

export function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  // Remount the scroll content when Dynamic Type changes so native text is remeasured.
  const { fontScale } = useWindowDimensions();
  const isDesktop = useIsDesktopLayout();
  const { animate, reduceMotion } = useOnboardingMotion();
  const progress = useSharedValue(0);
  const background = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1, 2], WELCOME_SCENES.map((scene) => scene.color)),
  }));
  return (
    <Animated.View testID="signin-screen" style={[{ flex: 1 }, background]}>
      <StatusBar style="dark" />
      <ScrollView key={fontScale} bounces={false} contentContainerStyle={{ flexGrow: 1, paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 20), flexDirection: isDesktop ? 'row' : 'column' }}>
        <View style={{ ...(isDesktop ? { flex: 1 } : { flexGrow: 1, flexShrink: 0 }), justifyContent: 'space-between', gap: 16, paddingHorizontal: isDesktop ? 40 : 20 }}>
          <OnboardingReveal style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 10 }}>
            <ClaireMark size={26} />
            <Text style={{ ...mobileType.sectionTitle, fontSize: 24, letterSpacing: -0.8, color: colors.ink }}>claire</Text>
          </OnboardingReveal>
          <OnboardingReveal delay={60} style={{ paddingTop: 18 }}>
            <Text
              accessibilityRole="header"
              style={{
                ...(isDesktop ? type.display : { ...mobileType.display, fontSize: 38, lineHeight: 40, letterSpacing: -1.2 }),
                textAlign: 'center',
                color: colors.ink,
              }}
            >
              {WELCOME_HEADLINE}
            </Text>
          </OnboardingReveal>
          <OnboardingReveal delay={120} style={{ paddingBottom: 8 }}>
            <WelcomeCarousel progress={progress} animate={animate} reduceMotion={reduceMotion} />
          </OnboardingReveal>
        </View>
        <OnboardingReveal delay={180} style={{ width: isDesktop ? 400 : '100%', justifyContent: 'center', paddingHorizontal: isDesktop ? 32 : space[5], paddingTop: 16, gap: 10 }}>
          <GoogleSignInButton mode="signin" variant="welcome" />
          <Pressable testID="signin-use-email" accessibilityRole="button" onPress={() => router.push('/(auth)/email')} style={{ minHeight: 52, borderRadius: 22, borderWidth: 1, borderColor: colors.ink, backgroundColor: colors.paper, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink, textAlign: 'center' }}>Continue with email</Text>
          </Pressable>
          <LegalConsent style={{ paddingTop: 4, paddingHorizontal: 12 }} />
        </OnboardingReveal>
      </ScrollView>
    </Animated.View>
  );
}
