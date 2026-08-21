import { useEffect, type ComponentType, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Bell, Bot, Check, ChevronRight, DatabaseZap, KeyRound, Link2, LogOut, MessageCircle, Smile, Sparkles } from 'lucide-react-native';
import { router } from 'expo-router';
import { colors, mobileType, radius, space, useIsDesktopLayout } from '@claire/design-system';
import { MobileAvatar, MobileHeader, SectionLabel } from '../../components/mobile/claire-mobile';
import { useAuthStore } from '../../stores/authStore';
import { useChatPreferencesStore } from '../../stores/chatPreferencesStore';
import { usePlatformStore } from '../../stores/platformStore';
import { PlatformStatus } from '../../types/platform';

type SettingsRow = {
  title: string;
  detail: string;
  icon: ComponentType<{ size?: number; color?: string }>;
  href?: string;
  testID: string;
  iconBackground: string;
  accessory?: ReactNode;
};

function SettingsGroup({ title, rows }: { title: string; rows: SettingsRow[] }) {
  return (
    <View>
      <SectionLabel title={title} />
      <View style={{ backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: 16, overflow: 'hidden', marginTop: 6 }}>
        {rows.map((row, index) => {
          const content = (
            <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.neutral[200] }}>
              <View style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 9, backgroundColor: row.iconBackground, alignItems: 'center', justifyContent: 'center' }}>
                <row.icon size={16} color={colors.ink} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{row.title}</Text>
                <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{row.detail}</Text>
              </View>
              {row.accessory ?? <ChevronRight size={18} color={colors.neutral[400]} />}
            </View>
          );
          if (!row.href) return <View key={row.testID}>{content}</View>;
          return (
            <Pressable
              key={row.testID}
              testID={row.testID}
              onPress={() => router.push(row.href as never)}
              style={({ pressed }) => ({ backgroundColor: pressed ? colors.sky : colors.paper })}
            >
              {content}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const isDesktop = useIsDesktopLayout();
  const user = useAuthStore(state => state.user);
  const logout = useAuthStore(state => state.logout);
  const resetPlatforms = usePlatformStore(state => state.reset);
  const connected = usePlatformStore(state => state.connectedSessions).filter(session => session.status === PlatformStatus.CONNECTED).length;
  const hydrate = useChatPreferencesStore(state => state.hydrate);
  const loopDetection = useChatPreferencesStore(state => state.loopDetection);
  const setLoopDetection = useChatPreferencesStore(state => state.setLoopDetection);

  useEffect(() => { void hydrate(); }, [hydrate]);

  const signOut = () => Alert.alert('Sign out?', 'Your synced messages stay in Claire. You can sign in again at any time.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: async () => { resetPlatforms(); await logout(); router.replace('/(auth)/signin'); } },
  ]);

  const displayName = user?.name || 'Your account';
  const planLine = [user?.email, 'Personal plan'].filter(Boolean).join(' · ');

  const claireRows: SettingsRow[] = [
    { title: 'AI behavior', detail: 'Suggestions, summaries, and memory', icon: Sparkles, href: '/settings/ai', testID: 'settings-ai-settings', iconBackground: colors.lavender },
    { title: 'Relationships', detail: 'People, categories, and prompts', icon: Smile, href: '/(tabs)/contacts', testID: 'settings-relationships', iconBackground: colors.blush },
    {
      title: 'Loop detection',
      detail: 'Automatically suggest tracking',
      icon: Check,
      testID: 'settings-loop-detection-row',
      iconBackground: colors.mint,
      accessory: (
        <Pressable
          testID="settings-loop-detection"
          accessibilityRole="switch"
          accessibilityState={{ checked: loopDetection }}
          onPress={() => void setLoopDetection(!loopDetection)}
          style={{
            width: 48,
            height: 28,
            borderRadius: 99,
            padding: 2,
            backgroundColor: loopDetection ? colors.lime : colors.neutral[200],
            justifyContent: 'center',
          }}
        >
          <View style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: colors.ink,
            alignSelf: loopDetection ? 'flex-end' : 'flex-start',
          }} />
        </Pressable>
      ),
    },
    { title: 'Auto-reply rules', detail: 'Review automation and safety limits', icon: Bot, href: '/settings/auto-reply', testID: 'settings-auto-reply', iconBackground: colors.mint },
  ];

  const appRows: SettingsRow[] = [
    { title: 'Connected accounts', detail: `${connected} platform${connected === 1 ? '' : 's'} active`, icon: Link2, href: '/(tabs)/connections', testID: 'settings-connections', iconBackground: colors.lavender },
    { title: 'Notifications', detail: 'Priority people and quiet hours', icon: Bell, href: '/settings/notifications', testID: 'settings-notifications', iconBackground: colors.sky },
    { title: 'Chat', detail: 'Plus button and reply options', icon: MessageCircle, href: '/settings/chat', testID: 'settings-chat', iconBackground: colors.neutral[100] },
    { title: 'Privacy & data', detail: 'Export, retention, and delete', icon: DatabaseZap, href: '/settings/privacy', testID: 'settings-privacy-data', iconBackground: colors.neutral[100] },
  ];

  if (isDesktop) {
    const nav = [
      ['Profile', '/settings'], ['Connections', '/connections'], ['AI behavior', '/settings/ai'], ['Relationships', '/people'], ['Notifications', '/settings/notifications'], ['Appearance', '/settings'], ['Shortcuts', '/settings'], ['Privacy & data', '/settings/privacy'], ['About', '/settings'],
    ] as const;
    return <View style={{ flex: 1, flexDirection: 'row', minHeight: 0, backgroundColor: colors.cream }} testID="desktop-settings-screen">
      <View style={{ width: 210, flexShrink: 0, padding: space[4], backgroundColor: '#F4F2EC', borderRightWidth: 1, borderColor: colors.neutral[200] }}><Text style={{ ...mobileType.sectionTitle, color: colors.ink, marginBottom: space[3] }}>Settings</Text>{nav.map(([label, href]) => <Pressable key={label} onPress={() => router.push(href as never)}><View style={{ minHeight: 34, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 9, backgroundColor: label === 'Profile' ? colors.ink : 'transparent', marginBottom: 3 }}><Text style={{ ...mobileType.bodySmall, color: label === 'Profile' ? colors.paper : colors.ink }}>{label}</Text></View></Pressable>)}</View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 34, paddingBottom: 60 }}><View style={{ width: '100%', maxWidth: 920, alignSelf: 'center', gap: 24 }}>
        <View><Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>YOUR CLAIRE</Text><Text style={{ ...mobileType.screenTitle, color: colors.ink, marginTop: 4 }}>Profile & preferences</Text><Text style={{ ...mobileType.bodySmall, color: colors.neutral[600], marginTop: 4 }}>Control how Claire remembers, suggests, and stays in touch.</Text></View>
        <Pressable onPress={() => router.push('/settings/account' as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: 16, backgroundColor: colors.sky, borderWidth: 1, borderColor: colors.ink }}><MobileAvatar name={displayName} uri={user?.avatar_url} size={48} tone={colors.blush} /><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{displayName}</Text><Text numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{planLine}</Text></View><ChevronRight size={18} color={colors.ink} /></Pressable>
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}><View style={{ flex: 1 }}><SettingsGroup title="Claire" rows={claireRows} /></View><View style={{ flex: 1 }}><SettingsGroup title="App" rows={appRows} /><View style={{ marginTop: 20 }}><SettingsGroup title="Account" rows={[{ title: 'Account & security', detail: 'Email, password, and sign-in methods', icon: KeyRound, href: '/settings/account', testID: 'settings-account-security', iconBackground: colors.sky }]} /></View></View></View>
        <Pressable testID="settings-logout" onPress={signOut} style={{ alignSelf: 'flex-start', borderRadius: radius.control, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200] }}><View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2], paddingHorizontal: 14 }}><LogOut size={17} color={colors.danger} /><Text style={{ ...mobileType.bodySmall, fontWeight: '700', color: colors.danger }}>Sign out</Text></View></Pressable>
      </View></ScrollView>
    </View>;
  }

  return (
    <ScrollView testID="settings-screen" style={{ flex: 1, backgroundColor: colors.cream }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 64 }}>
      <MobileHeader title="Settings" subtitle="Preferences, privacy, and account controls." />

      <View style={{ paddingHorizontal: space[4], gap: space[5] }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Account"
          onPress={() => router.push('/settings/account' as never)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.card, backgroundColor: colors.sky }}
        >
          <MobileAvatar name={displayName} uri={user?.avatar_url} size={44} tone={colors.blush} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{displayName}</Text>
            <Text numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{planLine}</Text>
          </View>
          <ChevronRight size={18} color={colors.ink} />
        </Pressable>

        <SettingsGroup title="Claire" rows={claireRows} />
        <SettingsGroup title="Account" rows={[
          {
            title: 'Account & security',
            detail: 'Email, password, and sign-in methods',
            icon: KeyRound,
            href: '/settings/account',
            testID: 'settings-account-security',
            iconBackground: colors.sky,
          },
        ]} />
        <SettingsGroup title="App" rows={appRows} />

        <Pressable
          testID="settings-logout"
          onPress={signOut}
          style={({ pressed }) => ({
            borderRadius: radius.control,
            backgroundColor: pressed ? colors.blush : colors.paper,
            borderWidth: 1,
            borderColor: colors.neutral[200],
          })}
        >
          <View style={{ minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2] }}>
            <LogOut size={18} color={colors.danger} />
            <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.danger }}>Sign out</Text>
          </View>
        </Pressable>
      </View>
    </ScrollView>
  );
}
