import { useEffect, type ComponentType, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Bell, Bot, Check, ChevronLeft, ChevronRight, DatabaseZap, Link2, LogOut, MessageCircle, Smile, Sparkles } from 'lucide-react-native';
import { router } from 'expo-router';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { MobileAvatar, MobileIconButton, SectionLabel } from '../../components/mobile/claire-mobile';
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
  const user = useAuthStore(state => state.user);
  const logout = useAuthStore(state => state.logout);
  const resetPlatforms = usePlatformStore(state => state.reset);
  const connected = usePlatformStore(state => state.connectedSessions).filter(session => session.status === PlatformStatus.CONNECTED).length;
  const hydrate = useChatPreferencesStore(state => state.hydrate);
  const promiseDetection = useChatPreferencesStore(state => state.promiseDetection);
  const setPromiseDetection = useChatPreferencesStore(state => state.setPromiseDetection);

  useEffect(() => { void hydrate(); }, [hydrate]);

  const signOut = () => Alert.alert('Sign out?', 'Your synced messages stay in Claire. You can sign in again at any time.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: async () => { resetPlatforms(); await logout(); router.replace('/(auth)/signin'); } },
  ]);

  const displayName = user?.name || 'Your account';
  const planLine = [user?.email, 'Personal plan'].filter(Boolean).join(' · ');

  const claireRows: SettingsRow[] = [
    { title: 'AI behavior', detail: 'Suggestions, summaries, and memory', icon: Sparkles, href: '/settings/ai', testID: 'settings-ai-settings', iconBackground: colors.lavender },
    { title: 'Relationships', detail: 'People, categories, and prompts', icon: Smile, href: '/people', testID: 'settings-relationships', iconBackground: colors.blush },
    {
      title: 'Promise detection',
      detail: 'Automatically suggest tracking',
      icon: Check,
      testID: 'settings-promise-detection-row',
      iconBackground: colors.mint,
      accessory: (
        <Pressable
          testID="settings-promise-detection"
          accessibilityRole="switch"
          accessibilityState={{ checked: promiseDetection }}
          onPress={() => void setPromiseDetection(!promiseDetection)}
          style={{
            width: 48,
            height: 28,
            borderRadius: 99,
            padding: 2,
            backgroundColor: promiseDetection ? colors.lime : colors.neutral[200],
            justifyContent: 'center',
          }}
        >
          <View style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: colors.ink,
            alignSelf: promiseDetection ? 'flex-end' : 'flex-start',
          }} />
        </Pressable>
      ),
    },
    { title: 'Auto-reply rules', detail: 'Review automation and safety limits', icon: Bot, href: '/settings/auto-reply', testID: 'settings-auto-reply', iconBackground: colors.mint },
  ];

  const appRows: SettingsRow[] = [
    { title: 'Connected accounts', detail: `${connected} platform${connected === 1 ? '' : 's'} active`, icon: Link2, href: '/connections', testID: 'settings-connections', iconBackground: colors.lavender },
    { title: 'Notifications', detail: 'Priority people and quiet hours', icon: Bell, href: '/settings/notifications', testID: 'settings-notifications', iconBackground: colors.sky },
    { title: 'Chat', detail: 'Plus button and reply options', icon: MessageCircle, href: '/settings/chat', testID: 'settings-chat', iconBackground: colors.neutral[100] },
    { title: 'Privacy & data', detail: 'Export, retention, and delete', icon: DatabaseZap, href: '/settings/privacy', testID: 'settings-privacy-data', iconBackground: colors.neutral[100] },
  ];

  return (
    <ScrollView testID="settings-screen" style={{ flex: 1, backgroundColor: colors.cream }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 64 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[3], minHeight: 52 }}>
        <MobileIconButton label="Back to More" onPress={() => router.replace('/more')}><ChevronLeft size={20} color={colors.ink} /></MobileIconButton>
        <Text style={{ flex: 1, textAlign: 'center', ...mobileType.sectionTitle, color: colors.ink }}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={{ paddingHorizontal: space[4], gap: space[5] }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Account"
          onPress={() => router.push('/settings/privacy' as never)}
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
