import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Check, ChevronRight, Laptop, Plus, RefreshCw, Smartphone } from 'lucide-react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, mobileType, radius, space, useIsDesktopLayout } from '@claire/design-system';
import { host } from '@claire/host';
import { API_BASE_URL, platformsApi, type PlatformDefinition } from '../../services/platforms';
import { isPendingPlatformStatus, usePlatformStore } from '../../stores/platformStore';
import { Platform, PlatformStatus, resolvePlatform } from '../../types/platform';
import { PlatformAuthModal } from '../../features/connections/legacy-platform-auth-modal';
import { MobileHeader, MobileIconButton, MobileState, SectionLabel } from '../../components/mobile/claire-mobile';
import { ConnectionsSkeleton } from '../../components/claire/skeleton';
import { useAuthStore } from '../../stores/authStore';
import { readQuerySnapshot, writeQuerySnapshot } from '../../services/mobile-cache';
import { ConnectionPlatformMark } from '../../features/connections/connection-platform-mark';
import { ConnectionRow, type ConnectionRowState } from '../../features/connections/connection-row';
import { CONNECTION_PLATFORM_CONFIG, connectionRoute } from '../../features/connections/connection-platform-config';

function ConnectionMark({ definition }: { definition: PlatformDefinition }) {
  const platform = resolvePlatform(definition.id);
  if (platform) return <ConnectionPlatformMark platform={platform} size={46} />;
  return (
    <View style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 15, backgroundColor: definition.accent, alignItems: 'center', justifyContent: 'center' }}>
      {definition.iconUrl ? <Image source={{ uri: definition.iconUrl }} style={{ width: 22, height: 22 }} contentFit="contain" /> : <Text style={{ ...mobileType.label, color: colors.paper }}>{definition.mark}</Text>}
    </View>
  );
}

export default function ConnectionsScreen() {
  const isDesktop = useIsDesktopLayout();
  const sessions = usePlatformStore(state => state.connectedSessions);
  const fetchSessions = usePlatformStore(state => state.fetchConnectedSessions);
  const [definitions, setDefinitions] = useState<PlatformDefinition[]>([]);
  const [requested, setRequested] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Platform | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accessToken = useAuthStore(state => state.token);
  const user = useAuthStore(state => state.user);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [catalog, interests] = await Promise.all([
        platformsApi.getPlatformDefinitions(),
        platformsApi.getPlatformInterests(),
        fetchSessions(),
      ]);
      setDefinitions(catalog);
      setRequested(interests);
      const userId = useAuthStore.getState().user?.id;
      if (userId) void writeQuerySnapshot(userId, 'platform-definitions', catalog).catch(() => undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load connections.');
    } finally {
      setLoading(false);
    }
  }, [fetchSessions]);
  // The catalog is effectively static between releases, but this screen threw
  // it away on every unmount and showed a skeleton again on the way back in.
  // Seed from the last known answer, then let the focus refresh correct it
  // behind the rendered list.
  useEffect(() => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return;
    let active = true;
    void readQuerySnapshot<PlatformDefinition[]>(userId, 'platform-definitions')
      .then((snapshot) => {
        if (!active || !snapshot?.data?.length) return;
        setDefinitions((current) => (current.length ? current : snapshot.data));
        setLoading(false);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const connectedPlatforms = useMemo(() => new Set(sessions.filter(session => session.status === PlatformStatus.CONNECTED).map(session => session.platform)), [sessions]);
  const canConnectOnMobile = (definition: PlatformDefinition) => definition.setupSurface === 'phone' && Object.values(Platform).includes(definition.id as Platform);
  const { available, otherAvailable, roadmap } = useMemo(() => {
    const availableItems = definitions.filter(item => item.supportStatus === 'available' || item.supportStatus === 'beta');
    return {
      available: availableItems,
      otherAvailable: availableItems.filter(item => !resolvePlatform(item.id)),
      roadmap: definitions.filter(item => item.supportStatus === 'planned' || item.supportStatus === 'unavailable'),
    };
  }, [definitions]);

  const act = async (definition: PlatformDefinition) => {
    const platform = resolvePlatform(definition.id);
    const supportedNow = definition.supportStatus === 'available' || definition.supportStatus === 'beta';
    if (!isDesktop && platform && (supportedNow || connectedPlatforms.has(platform))) {
      router.push(connectionRoute(platform, 'settings'));
      return;
    }
    if (connectedPlatforms.has(definition.id as Platform)) return;
    if (canConnectOnMobile(definition)) {
      setSelected(definition.id as Platform);
      return;
    }
    if (definition.id === Platform.INSTAGRAM && host.name === 'electron' && accessToken) {
      setError(null);
      const result = await host.startInstagramLogin({ apiUrl: API_BASE_URL, accessToken });
      if (!result.success) setError(result.error || 'Instagram sign-in did not finish.');
      else await load();
      return;
    }
    if (definition.id === Platform.IMESSAGE && host.name === 'electron') {
      const status = await host.getCompanionStatus();
      if (status.imessage === 'ready') {
        if (!accessToken || !user?.id) {
          setError('Sign in again before enrolling this Mac for iMessage sync.');
          return;
        }
        const result = await host.configureCompanion({ apiUrl: API_BASE_URL, accessToken, userId: user.id });
        if (!result.success) setError(result.error || 'Could not start iMessage sync.');
        else { setError(null); await load(); }
      } else if (status.imessage === 'needs_permission') {
        await host.openSystemSettings('full_disk_access');
        setError('Grant Full Disk Access to Claire, then return here to finish iMessage setup.');
      } else {
        setError('iMessage setup is available only in Claire Desktop on a Mac.');
      }
      return;
    }
    if (definition.supportStatus === 'planned' || definition.supportStatus === 'unavailable') {
      await platformsApi.requestPlatformInterest(definition.id);
      setRequested(current => current.includes(definition.id) ? current : [...current, definition.id]);
    }
  };

  const renderRow = (definition: PlatformDefinition, isLast: boolean) => {
    const connected = connectedPlatforms.has(definition.id as Platform);
    const isRequested = requested.includes(definition.id);
    const mobileSetup = canConnectOnMobile(definition);
    const desktopConnectable = (definition.id === Platform.INSTAGRAM || definition.id === Platform.IMESSAGE) && host.name === 'electron';
    const actionLabel = connected ? 'Connected' : isRequested ? 'Requested' : mobileSetup || desktopConnectable ? 'Connect' : definition.setupSurface === 'desktop' || definition.setupSurface === 'mac' ? 'Claire Desktop' : 'Join waitlist';
    return (
      <View key={definition.id}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${definition.name}. ${actionLabel}`}
          onPress={() => void act(definition)}
          style={({ pressed }) => ({ backgroundColor: colors.paper, opacity: pressed ? 0.7 : 1 })}
        >
          <View style={{ minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3] }}>
            <ConnectionMark definition={definition} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text numberOfLines={1} style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{definition.name}</Text>
              <Text numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{definition.setupLabel}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {connected || isRequested ? <Check size={13} color={colors.success} /> : mobileSetup ? <Smartphone size={13} color={colors.neutral[600]} /> : <Laptop size={13} color={colors.neutral[600]} />}
                <Text style={{ ...mobileType.label, color: connected ? colors.success : colors.neutral[600] }}>{actionLabel}</Text>
              </View>
            </View>
            <ChevronRight size={18} color={colors.neutral[400]} />
          </View>
        </Pressable>
        {isLast ? null : <View style={{ height: 1, backgroundColor: colors.neutral[200] }} />}
      </View>
    );
  };

  const renderConnectionRows = (items: PlatformDefinition[]) => (
    <View style={{ marginTop: space[2], paddingHorizontal: space[3], borderRadius: radius.card, backgroundColor: colors.paper }}>
      {items.map((definition, index) => {
        const platform = resolvePlatform(definition.id)!;
        const config = CONNECTION_PLATFORM_CONFIG[platform];
        const platformSessions = sessions.filter((session) => session.platform === platform);
        let state: ConnectionRowState = config.setupSurface === 'desktop' ? 'desktop' : config.setupSurface === 'mac' ? 'mac' : 'available';
        if (platformSessions.some((session) => session.status === PlatformStatus.CONNECTED)) state = 'connected';
        else if (platformSessions.some((session) => isPendingPlatformStatus(session.status))) state = 'pending';
        return (
          <ConnectionRow
            key={platform}
            platform={platform}
            name={config.name}
            detail={config.detail}
            state={state}
            isLast={index === items.length - 1}
            onPress={() => void act(definition)}
          />
        );
      })}
    </View>
  );

  if (isDesktop) {
    return <View style={{ flex: 1, minHeight: 0, flexDirection: 'row', backgroundColor: colors.cream }} testID="desktop-connections-screen">
      <DesktopSettingsNav active="Connections" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 34, paddingBottom: 60 }}>
        <View style={{ width: '100%', maxWidth: 1080, alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}><View><Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>ACCOUNTS & BRIDGES</Text><Text style={{ ...mobileType.screenTitle, color: colors.ink, marginTop: 4 }}>Connections</Text><Text style={{ ...mobileType.bodySmall, color: colors.neutral[600], marginTop: 3 }}>{connectedPlatforms.size} active networks · desktop-aware setup</Text></View><Pressable onPress={() => void load()}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: colors.ink }}><Plus size={16} color={colors.paper} /><Text style={{ ...mobileType.label, color: colors.paper }}>Add connection</Text></View></Pressable></View>
          <View style={{ flexDirection: 'row', gap: 9, alignItems: 'center', padding: 13, borderRadius: 13, borderWidth: 1, borderColor: colors.ink, backgroundColor: colors.sky, marginBottom: 18 }}><Laptop size={19} color={colors.ink} /><Text style={{ flex: 1, ...mobileType.bodySmall, color: colors.ink }}><Text style={{ fontWeight: '700' }}>This Mac can host on-device connections.</Text> iMessage is available while Claire Desktop and Messages are running.</Text></View>
          {loading ? <ConnectionsSkeleton /> : error ? <MobileState error title="Connections unavailable" message={error} /> : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 13 }}>{[...available, ...roadmap].map((definition) => <DesktopConnectionCard key={definition.id} definition={definition} connected={connectedPlatforms.has(definition.id as Platform)} requested={requested.includes(definition.id)} onPress={() => void act(definition)} />)}</View>}
        </View>
      </ScrollView>
      <PlatformAuthModal platform={selected} visible={!!selected} onClose={() => setSelected(null)} onSuccess={() => { setSelected(null); void load(); }} existingSession={selected ? sessions.find(session => session.platform === selected && session.status === PlatformStatus.CONNECTED) || null : null} />
    </View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 48 }}>
        <MobileHeader
          title="Connections"
          subtitle="Bring your conversations into Claire."
          actions={<MobileIconButton label="Refresh connections" onPress={() => void load()}><RefreshCw size={18} color={colors.ink} /></MobileIconButton>}
        />
        {loading ? (
          <View style={{ paddingHorizontal: space[4] }}><ConnectionsSkeleton /></View>
        ) : error ? <MobileState error title="Connections unavailable" message={error} /> : (
          <View style={{ paddingHorizontal: space[4], gap: space[4] }}>
            <View style={{ padding: space[4], borderRadius: radius.card, backgroundColor: colors.ink, gap: space[2] }}>
              <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
                <Plus size={19} color={colors.ink} />
              </View>
              <Text style={{ ...mobileType.sectionTitle, color: colors.paper }}>One inbox, your choice of networks</Text>
              <Text style={{ ...mobileType.bodySmall, color: colors.neutral[300] }}>Phone-safe setup happens here. Desktop-only connectors tell you when Claire Desktop is required.</Text>
            </View>
            {available.some((item) => resolvePlatform(item.id) && CONNECTION_PLATFORM_CONFIG[resolvePlatform(item.id)!].setupSurface === 'phone') ? (
              <View>
                <SectionLabel title="Connect on this phone" />
                {renderConnectionRows(available.filter((item) => {
                  const platform = resolvePlatform(item.id);
                  return platform ? CONNECTION_PLATFORM_CONFIG[platform].setupSurface === 'phone' : false;
                }))}
              </View>
            ) : null}
            {available.some((item) => resolvePlatform(item.id) && CONNECTION_PLATFORM_CONFIG[resolvePlatform(item.id)!].setupSurface !== 'phone') ? (
              <View>
                <SectionLabel title="Finish on another device" />
                {renderConnectionRows(available.filter((item) => {
                  const platform = resolvePlatform(item.id);
                  return platform ? CONNECTION_PLATFORM_CONFIG[platform].setupSurface !== 'phone' : false;
                }))}
              </View>
            ) : null}
            {otherAvailable.length ? (
              <View>
                <SectionLabel title="Other connections" />
                <View style={{ backgroundColor: colors.paper, borderRadius: radius.card, paddingHorizontal: space[3], marginTop: space[2] }}>
                  {otherAvailable.map((item, index) => renderRow(item, index === otherAvailable.length - 1))}
                </View>
              </View>
            ) : null}
            {roadmap.length ? (
              <View>
                <SectionLabel title="On the roadmap" detail="Vote with a tap" />
                <View style={{ backgroundColor: colors.paper, borderRadius: radius.card, paddingHorizontal: space[3], marginTop: space[2] }}>
                  {roadmap.map((item, index) => renderRow(item, index === roadmap.length - 1))}
                </View>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function DesktopSettingsNav({ active }: { active: string }) {
  const items = ['Profile', 'Connections', 'AI behavior', 'Relationships', 'Notifications', 'Appearance', 'Shortcuts', 'Privacy & data', 'About'];
  return <View style={{ width: 210, flexShrink: 0, padding: space[4], backgroundColor: '#F4F2EC', borderRightWidth: 1, borderColor: colors.neutral[200] }}><Text style={{ ...mobileType.sectionTitle, color: colors.ink, marginBottom: space[3] }}>Settings</Text>{items.map((item) => <View key={item} style={{ minHeight: 34, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 9, backgroundColor: item === active ? colors.ink : 'transparent', marginBottom: 3 }}><Text style={{ ...mobileType.bodySmall, color: item === active ? colors.paper : colors.ink }}>{item}</Text></View>)}</View>;
}

function DesktopConnectionCard({ definition, connected, requested, onPress }: { definition: PlatformDefinition; connected: boolean; requested: boolean; onPress: () => void }) {
  const state = connected ? 'CONNECTED' : requested ? 'REQUESTED' : definition.id === Platform.IMESSAGE ? 'LOCAL' : definition.id === Platform.INSTAGRAM ? 'DESKTOP AUTH' : definition.supportStatus === 'available' || definition.supportStatus === 'beta' ? 'AVAILABLE' : 'PLANNED';
  return <View style={{ width: '31%', minWidth: 240, minHeight: 182, padding: space[3], borderWidth: 1, borderColor: definition.id === Platform.IMESSAGE ? colors.ink : colors.neutral[200], borderRadius: 16, backgroundColor: colors.paper, justifyContent: 'space-between' }}><View><View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}><ConnectionMark definition={definition} /><View style={{ flex: 1, minWidth: 0 }}><Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{definition.name}</Text><Text style={{ ...mobileType.label, color: colors.neutral[600] }}>{definition.setupLabel}</Text></View></View><Text style={{ ...mobileType.monoLabel, color: state === 'CONNECTED' ? colors.success : state === 'LOCAL' ? colors.focus : colors.neutral[600], marginTop: 13 }}>{state}</Text><Text style={{ ...mobileType.bodySmall, color: colors.neutral[600], marginTop: 4 }}>{definition.id === Platform.IMESSAGE ? 'Uses Messages and macOS permissions.' : definition.id === Platform.INSTAGRAM ? 'Sign in safely in Claire Desktop.' : definition.setupSurface === 'phone' ? 'Cloud bridge and synced history.' : 'Requires a future bridge.'}</Text></View><Pressable onPress={onPress}><View style={{ alignSelf: 'flex-start', marginTop: 14, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: colors.ink, borderRadius: 99 }}><Text style={{ ...mobileType.label, color: colors.ink }}>{connected ? 'Manage' : definition.id === Platform.IMESSAGE ? 'Permissions' : definition.id === Platform.INSTAGRAM ? 'Reconnect' : definition.supportStatus === 'available' ? 'Connect' : 'Join waitlist'}</Text></View></Pressable></View>;
}
