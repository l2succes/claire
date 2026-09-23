import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BellRing, ChevronLeft, Moon, ShieldCheck } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { useAuthStore } from '../../stores/authStore';
import {
  getNativeNotificationPermission,
  registerNotificationDevice,
  requestNativeNotificationPermission,
} from '../../services/notifications';
import { platformCapabilities } from '../../utils/platformCapabilities';
import { completeNotificationStep } from './notification-step';
import { nextOnboardingRoute, onboardingHomeRoute, onboardingPaywallRoute } from './onboarding-flow';
import { NotificationArtwork } from './notification-artwork';
import { OnboardingProgress, type OnboardingProgressVariant } from './onboarding-progress';

type Permission = 'undetermined' | 'granted' | 'denied' | 'unsupported';

function permissionLabel(permission: Permission) {
  if (permission === 'granted') return 'Continue';
  if (permission === 'denied') return 'Open device settings';
  if (permission === 'unsupported') return 'Continue';
  return 'Turn on notifications';
}

export function OnboardingNotificationsView({
  permission,
  progressVariant = 'bar',
  busy = false,
  error,
  onEnable,
  onSkip,
  onBack,
}: {
  permission: Permission;
  progressVariant?: OnboardingProgressVariant;
  busy?: boolean;
  error?: string | null;
  onEnable: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View testID="onboarding-notifications-screen" style={{ flex: 1, backgroundColor: colors.cream }}>
      <StatusBar style="dark" />
      <View style={{ paddingTop: Math.max(insets.top, space[2]), paddingHorizontal: space[4], minHeight: 58 + insets.top, flexDirection: 'row', alignItems: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to connected accounts" onPress={onBack} style={{ width: 42, height: 42, borderRadius: 13, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={20} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>Notifications</Text>
          {progressVariant === 'dots' ? <OnboardingProgress stage="notifications" variant="dots" /> : null}
        </View>
        <View style={{ width: 42 }} />
      </View>
      {progressVariant === 'bar' ? <View style={{ paddingHorizontal: space[4], paddingVertical: space[2] }}><OnboardingProgress stage="notifications" /></View> : null}

      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[4], alignItems: 'center', gap: space[4] }}>
        <NotificationArtwork />
        <View style={{ width: '100%', maxWidth: 450, alignItems: 'center', gap: space[3] }}>
          <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600], letterSpacing: 1.1 }}>STAY IN THE LOOP</Text>
          <Text accessibilityRole="header" style={{ ...mobileType.display, fontSize: 36, lineHeight: 39, letterSpacing: -1.1, color: colors.ink, textAlign: 'center' }}>
            {permission === 'granted' ? 'You’re all set.' : 'The right things, right on time.'}
          </Text>
          <Text style={{ ...mobileType.body, color: colors.neutral[600], textAlign: 'center', maxWidth: 390 }}>
            New messages when they arrive. Gentle reminders for plans you want to remember. Nothing gets sent on your behalf.
          </Text>
        </View>
        <View style={{ width: '100%', maxWidth: 450, gap: space[3], padding: space[4], borderRadius: radius.card, borderCurve: 'continuous', backgroundColor: colors.mint }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}><BellRing size={20} color={colors.ink} /><Text style={{ flex: 1, ...mobileType.bodySmall, fontWeight: '700', color: colors.ink }}>Useful updates, not every little thing.</Text></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}><Moon size={20} color={colors.ink} /><Text style={{ flex: 1, ...mobileType.bodySmall, color: colors.ink }}>Set quiet hours and choose alert types anytime.</Text></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}><ShieldCheck size={20} color={colors.ink} /><Text style={{ flex: 1, ...mobileType.bodySmall, color: colors.ink }}>Your notification settings stay in your control.</Text></View>
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: Math.max(insets.bottom, space[4]), gap: space[2], borderTopWidth: 1, borderTopColor: colors.neutral[200], backgroundColor: colors.cream }}>
        {error ? <Text testID="onboarding-notifications-error" style={{ ...mobileType.bodySmall, color: colors.danger, textAlign: 'center' }}>{error}</Text> : null}
        {permission === 'denied' ? <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600], textAlign: 'center' }}>Notifications are off. You can change this in your device settings or continue without them.</Text> : null}
        <Pressable testID="onboarding-notifications-enable" accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={onEnable} style={{ minHeight: 54, borderRadius: 18, borderCurve: 'continuous', backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.7 : 1 }}>
          {busy ? <ActivityIndicator color={colors.paper} /> : <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.paper }}>{permissionLabel(permission)}</Text>}
        </Pressable>
        {permission !== 'granted' ? <Pressable testID="onboarding-notifications-skip" accessibilityRole="button" onPress={onSkip} disabled={busy} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ ...mobileType.bodySmall, fontWeight: '700', color: colors.ink }}>Not now</Text></Pressable> : null}
      </View>
    </View>
  );
}

export function OnboardingNotificationsScreen() {
  const userId = useAuthStore((state) => state.user?.id);
  const token = useAuthStore((state) => state.token);
  const [permission, setPermission] = useState<Permission>('undetermined');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!platformCapabilities.supportsNativeNotifications) {
      router.replace(onboardingHomeRoute as never);
      return;
    }
    let active = true;
    const refresh = () => void getNativeNotificationPermission()
      .then((status) => { if (active) setPermission(status as Permission); })
      .catch(() => { if (active) setError('Could not check notification settings. You can still continue.'); });
    refresh();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => { active = false; subscription.remove(); };
  }, []);

  const finish = useCallback(async () => {
    if (userId) await completeNotificationStep(userId).catch(() => undefined);
    const destination = await nextOnboardingRoute(userId, { skipNotificationStep: true })
      .catch(() => onboardingPaywallRoute);
    router.replace(destination as never);
  }, [userId]);

  const enable = async () => {
    if (busy) return;
    setError(null);
    if (permission === 'granted' || permission === 'unsupported') {
      await finish();
      return;
    }
    if (permission === 'denied') {
      try { await Linking.openSettings(); }
      catch { setError('Could not open device settings. You can continue and change this later.'); }
      return;
    }
    setBusy(true);
    try {
      const status = await requestNativeNotificationPermission();
      setPermission(status as Permission);
      if (status === 'granted') {
        if (token) void registerNotificationDevice(token).catch((cause) => console.warn('Notification registration will retry:', cause));
        await finish();
      }
    } catch {
      setError('Could not turn on notifications. You can try again or continue without them.');
    } finally {
      setBusy(false);
    }
  };

  return <OnboardingNotificationsView permission={permission} busy={busy} error={error} onEnable={() => void enable()} onSkip={() => void finish()} onBack={() => router.replace('/(auth)/login?review=1')} />;
}
