import { useCallback, useEffect, useRef } from 'react';
import { Alert, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, HelpCircle, ShieldCheck } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { useAuthStore } from '../../stores/authStore';
import { isPendingPlatformStatus, useHasAnyConnection, usePlatformStore } from '../../stores/platformStore';
import { Platform, PlatformStatus } from '../../types/platform';
import {
  COMPANION_CONNECTION_PLATFORMS,
  CONNECTION_PLATFORM_CONFIG,
  PHONE_CONNECTION_PLATFORMS,
  connectionRoute,
} from './connection-platform-config';
import { ConnectionRow, type ConnectionRowState } from './connection-row';
import { OnboardingReveal } from '../onboarding/onboarding-reveal';
import { OnboardingProgress, type OnboardingProgressVariant } from '../onboarding/onboarding-progress';
import { nextOnboardingRoute, onboardingHomeRoute } from '../onboarding/onboarding-flow';
import { notificationOnboardingRoute } from '../onboarding/notification-step';
import { platformCapabilities } from '../../utils/platformCapabilities';

export type OnboardingConnectionStates = Partial<Record<Platform, ConnectionRowState>>;

function defaultConnectionState(platform: Platform): ConnectionRowState {
  if (platform === Platform.INSTAGRAM) return CONNECTION_PLATFORM_CONFIG[Platform.INSTAGRAM].setupSurface === 'phone' ? 'available' : 'desktop';
  if (platform === Platform.IMESSAGE) return 'mac';
  return 'available';
}

export function OnboardingConnectionsView({
  states,
  hasConnection,
  showDevelopmentSkip = false,
  progressVariant = 'bar',
  onBack,
  onHelp,
  onSelectPlatform,
  onContinue,
  onSkip,
}: {
  states: OnboardingConnectionStates;
  hasConnection: boolean;
  showDevelopmentSkip?: boolean;
  progressVariant?: OnboardingProgressVariant;
  onBack: () => void;
  onHelp: () => void;
  onSelectPlatform: (platform: Platform) => void;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const insets = useSafeAreaInsets();
  const renderRows = (platforms: readonly Platform[]) => (
    <View style={{ marginTop: space[2], paddingHorizontal: space[3], borderRadius: radius.card, backgroundColor: colors.paper }}>
      {platforms.map((platform, index) => {
        const config = CONNECTION_PLATFORM_CONFIG[platform];
        return (
          <ConnectionRow
            key={platform}
            testID={`platform-selector-${platform}`}
            platform={platform}
            name={config.name}
            detail={config.detail}
            state={states[platform] ?? defaultConnectionState(platform)}
            isLast={index === platforms.length - 1}
            onPress={() => onSelectPlatform(platform)}
          />
        );
      })}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }} testID="platform-login-screen">
      <StatusBar style="dark" />
      <View style={{ paddingTop: Math.max(insets.top, space[2]), paddingHorizontal: space[4], minHeight: 58 + insets.top, flexDirection: 'row', alignItems: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={{ width: 42, height: 42, borderRadius: 13, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={20} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>Connect accounts</Text>
          {platformCapabilities.supportsNativeNotifications && progressVariant === 'dots' ? <OnboardingProgress stage="connections" variant="dots" /> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="How connecting works" onPress={onHelp} style={{ width: 42, height: 42, borderRadius: 13, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' }}>
          <HelpCircle size={18} color={colors.ink} />
        </Pressable>
      </View>
      {platformCapabilities.supportsNativeNotifications && progressVariant === 'bar' ? <View style={{ paddingHorizontal: space[4], paddingVertical: space[2] }}><OnboardingProgress stage="connections" /></View> : null}

      <ScrollView style={{ flex: 1 }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: space[5], gap: space[5] }}>
        <OnboardingReveal style={{ gap: 7, paddingVertical: space[2] }}>
          <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>CONNECT YOUR ACCOUNTS</Text>
          <Text style={{ ...mobileType.screenTitle, fontSize: 31, lineHeight: 34, color: colors.ink }}>Bring every conversation into Claire.</Text>
          <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600], maxWidth: 340 }}>Start with one account. After it connects, come back here to add another or continue to Claire.</Text>
        </OnboardingReveal>

        <OnboardingReveal delay={100}>
          <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>CONNECT ON THIS PHONE</Text>
          {renderRows(PHONE_CONNECTION_PLATFORMS)}
        </OnboardingReveal>

        <OnboardingReveal delay={160}>
          <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>FINISH ON ANOTHER DEVICE</Text>
          {renderRows(COMPANION_CONNECTION_PLATFORMS)}
        </OnboardingReveal>

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[2], padding: space[3], borderRadius: 15, borderCurve: 'continuous', backgroundColor: colors.mint }}>
          <ShieldCheck size={18} color={colors.ink} />
          <Text style={{ flex: 1, ...mobileType.label, fontWeight: '400', color: colors.ink }}><Text style={{ fontWeight: '700' }}>Private by design. </Text>Claire only uses each connection to sync your conversations. Disconnect whenever you want.</Text>
        </View>
      </ScrollView>

      <View style={{ gap: space[2], paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: Math.max(insets.bottom, space[4]), borderTopWidth: 1, borderTopColor: colors.neutral[200], backgroundColor: colors.cream }}>
        <Pressable testID="platform-login-continue" accessibilityRole="button" accessibilityState={{ disabled: !hasConnection }} disabled={!hasConnection} onPress={onContinue} style={{ minHeight: 52, borderRadius: 16, borderCurve: 'continuous', backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', opacity: hasConnection ? 1 : 0.34 }}>
          <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.paper }}>Continue</Text>
        </Pressable>
        {hasConnection ? null : <Text style={{ ...mobileType.label, fontWeight: '400', color: colors.neutral[600], textAlign: 'center' }}>Connect one account to continue</Text>}
        {showDevelopmentSkip && !hasConnection ? (
          <TouchableOpacity testID="platform-login-skip-dev" onPress={onSkip} style={{ padding: space[2] }}>
            <Text style={{ ...mobileType.label, fontWeight: '400', color: colors.neutral[400], textAlign: 'center' }}>Skip in development</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

export function OnboardingConnectionsScreen() {
  const { review } = useLocalSearchParams<{ review?: string }>();
  const checkedEntryState = useRef(false);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userId = useAuthStore((state) => state.user?.id);
  const sessions = usePlatformStore((state) => state.connectedSessions);
  const isInitialized = usePlatformStore((state) => state.isInitialized);
  const initialize = usePlatformStore((state) => state.initialize);
  const fetchSessions = usePlatformStore((state) => state.fetchConnectedSessions);
  const hasConnection = useHasAnyConnection();
  const navigateToNextStep = useCallback(async () => {
    const fallback = platformCapabilities.supportsNativeNotifications ? notificationOnboardingRoute : onboardingHomeRoute;
    const destination = await nextOnboardingRoute(userId).catch(() => fallback);
    router.replace(destination as never);
  }, [userId]);

  useEffect(() => {
    if (checkedEntryState.current) return;
    checkedEntryState.current = true;

    void (async () => {
      if (!isInitialized) await initialize();
      const serverSessions = await fetchSessions();
      const alreadyConnected = serverSessions.some((session) => session.status === PlatformStatus.CONNECTED);
      if (isAuthenticated && alreadyConnected && review !== '1') {
        await navigateToNextStep();
      }
    })();
  }, [fetchSessions, initialize, isAuthenticated, isInitialized, navigateToNextStep, review]);

  useFocusEffect(useCallback(() => {
    void fetchSessions();
  }, [fetchSessions]));

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/signin');
  };

  const rowState = (platform: Platform): ConnectionRowState => {
    const platformSessions = sessions.filter((session) => session.platform === platform);
    if (platformSessions.some((session) => session.status === PlatformStatus.CONNECTED)) return 'connected';
    if (platformSessions.some((session) => isPendingPlatformStatus(session.status))) return 'pending';
    if (platform === Platform.INSTAGRAM) return defaultConnectionState(platform);
    if (platform === Platform.IMESSAGE) return 'mac';
    return 'available';
  };

  return (
    <OnboardingConnectionsView
      states={Object.fromEntries([...PHONE_CONNECTION_PLATFORMS, ...COMPANION_CONNECTION_PLATFORMS].map((platform) => [platform, rowState(platform)]))}
      hasConnection={hasConnection}
      showDevelopmentSkip={__DEV__}
      onBack={handleBack}
      onHelp={() => Alert.alert('Your account stays yours', 'Claire connects through dedicated, encrypted bridges. You can disconnect any account later in Settings.')}
      onSelectPlatform={(platform) => router.replace(connectionRoute(platform, 'onboarding'))}
      onContinue={() => void navigateToNextStep()}
      onSkip={() => void navigateToNextStep()}
    />
  );
}
