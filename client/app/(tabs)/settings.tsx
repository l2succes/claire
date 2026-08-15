import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Bell, Bot, ChevronLeft, ChevronRight, Link2, LogOut, ShieldCheck, Sparkles } from 'lucide-react-native';
import { router } from 'expo-router';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { MobileAvatar, MobileHeader, MobileIconButton, SectionLabel } from '../../components/mobile/claire-mobile';
import { useAuthStore } from '../../stores/authStore';
import { usePlatformStore } from '../../stores/platformStore';
import { PlatformStatus } from '../../types/platform';

const rows = [
  { title: 'Connections', detail: 'Messaging accounts and companion setup', icon: Link2, href: '/connections' },
  { title: 'Notifications', detail: 'Alerts, badges, and quiet hours', icon: Bell, href: '/settings/notifications' },
  { title: 'AI Settings', detail: 'Your voice, language, and reply style', icon: Sparkles, href: '/settings/ai' },
  { title: 'Auto-reply rules', detail: 'Review automation and safety limits', icon: Bot, href: '/settings/auto-reply' },
] as const;

export default function SettingsScreen() {
  const user = useAuthStore(state => state.user);
  const logout = useAuthStore(state => state.logout);
  const resetPlatforms = usePlatformStore(state => state.reset);
  const connected = usePlatformStore(state => state.connectedSessions).filter(session => session.status === PlatformStatus.CONNECTED).length;

  const signOut = () => Alert.alert('Sign out?', 'Your synced messages stay in Claire. You can sign in again at any time.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: async () => { resetPlatforms(); await logout(); router.replace('/(auth)/signin'); } },
  ]);

  return (
    <ScrollView testID="settings-screen" style={{ flex: 1, backgroundColor: colors.cream }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 64 }}>
      <MobileHeader title="Settings" subtitle="Claire should feel personal, private, and predictable." actions={<MobileIconButton label="Back" onPress={() => router.back()}><ChevronLeft size={20} color={colors.ink} /></MobileIconButton>} />
      <View style={{ paddingHorizontal: space[4], gap: space[5] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200] }}>
          <MobileAvatar name={user?.name || user?.email || 'Claire user'} uri={user?.avatar_url} size={56} />
          <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ ...mobileType.sectionTitle, color: colors.ink }}>{user?.name || 'Your account'}</Text><Text numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{user?.email}</Text><View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 }}><ShieldCheck size={14} color={colors.success} /><Text style={{ ...mobileType.label, color: colors.success }}>{connected} connected {connected === 1 ? 'platform' : 'platforms'}</Text></View></View>
        </View>

        <View style={{ gap: space[2] }}><SectionLabel title="Claire" />{rows.map(row => <Pressable key={row.title} testID={`settings-${row.title.toLowerCase().replace(/[^a-z]+/g, '-')}`} onPress={() => router.push(row.href as never)} style={({ pressed }) => ({ minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.control, backgroundColor: pressed ? colors.sky : colors.paper, borderWidth: 1, borderColor: colors.neutral[200] })}><View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: row.title === 'AI Settings' ? colors.lavender : colors.neutral[100], alignItems: 'center', justifyContent: 'center' }}><row.icon size={19} color={colors.ink} /></View><View style={{ flex: 1 }}><Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{row.title}</Text><Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{row.detail}</Text></View><ChevronRight size={18} color={colors.neutral[400]} /></Pressable>)}</View>

        <Pressable testID="settings-logout" onPress={signOut} style={({ pressed }) => ({ minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2], borderRadius: radius.control, backgroundColor: pressed ? colors.blush : colors.paper, borderWidth: 1, borderColor: colors.neutral[200] })}><LogOut size={18} color={colors.danger} /><Text style={{ ...mobileType.body, fontWeight: '700', color: colors.danger }}>Sign out</Text></Pressable>
        <Text style={{ ...mobileType.label, color: colors.neutral[400], textAlign: 'center' }}>CLAIRE · PRIVATE BY DESIGN</Text>
      </View>
    </ScrollView>
  );
}
