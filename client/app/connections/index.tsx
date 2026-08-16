import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Check, ChevronLeft, ChevronRight, Laptop, Plus, RefreshCw, Smartphone } from 'lucide-react-native';
import { router } from 'expo-router';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { platformsApi, type PlatformDefinition } from '../../services/platforms';
import { usePlatformStore } from '../../stores/platformStore';
import { Platform, PlatformStatus, resolvePlatform } from '../../types/platform';
import { PlatformIcon } from '../../components/PlatformIcon';
import { PlatformAuthModal } from '../../components/PlatformAuthModal';
import { MobileHeader, MobileIconButton, MobileState, SectionLabel } from '../../components/mobile/claire-mobile';
import { ConnectionsSkeleton } from '../../components/claire/skeleton';

function ConnectionMark({ definition }: { definition: PlatformDefinition }) {
  const platform = resolvePlatform(definition.id);
  return (
    <View style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 15, backgroundColor: definition.accent, alignItems: 'center', justifyContent: 'center' }}>
      {platform ? <PlatformIcon platform={platform} size={22} color="#FFFFFF" /> : definition.iconUrl ? <Image source={{ uri: definition.iconUrl }} style={{ width: 22, height: 22 }} contentFit="contain" /> : <Text style={{ ...mobileType.label, color: colors.paper }}>{definition.mark}</Text>}
    </View>
  );
}

export default function ConnectionsScreen() {
  const sessions = usePlatformStore(state => state.connectedSessions);
  const fetchSessions = usePlatformStore(state => state.fetchConnectedSessions);
  const [definitions, setDefinitions] = useState<PlatformDefinition[]>([]);
  const [requested, setRequested] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Platform | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const [catalog, interests] = await Promise.all([
        platformsApi.getPlatformDefinitions(),
        platformsApi.getPlatformInterests(),
        fetchSessions(),
      ]);
      setDefinitions(catalog);
      setRequested(interests);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load connections.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const connectedPlatforms = useMemo(() => new Set(sessions.filter(session => session.status === PlatformStatus.CONNECTED).map(session => session.platform)), [sessions]);
  const canConnectOnMobile = (definition: PlatformDefinition) => definition.setupSurface === 'phone' && Object.values(Platform).includes(definition.id as Platform);
  const available = definitions.filter(item => item.supportStatus === 'available' || item.supportStatus === 'beta');
  const roadmap = definitions.filter(item => item.supportStatus === 'planned' || item.supportStatus === 'unavailable');

  const act = async (definition: PlatformDefinition) => {
    if (connectedPlatforms.has(definition.id as Platform)) return;
    if (canConnectOnMobile(definition)) {
      setSelected(definition.id as Platform);
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
    const actionLabel = connected ? 'Connected' : isRequested ? 'Requested' : mobileSetup ? 'Connect' : definition.setupSurface === 'desktop' || definition.setupSurface === 'mac' ? 'Claire Desktop' : 'Join waitlist';
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 48 }}>
        <MobileHeader
          title="Connections"
          subtitle="Bring your conversations into Claire."
          leading={<MobileIconButton label="Back" onPress={() => router.back()}><ChevronLeft size={20} color={colors.ink} /></MobileIconButton>}
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
            <View>
              <SectionLabel title="Connect now" />
              <View style={{ backgroundColor: colors.paper, borderRadius: radius.card, paddingHorizontal: space[3], marginTop: space[2] }}>
                {available.map((item, index) => renderRow(item, index === available.length - 1))}
              </View>
            </View>
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
      <PlatformAuthModal
        platform={selected}
        visible={!!selected}
        onClose={() => setSelected(null)}
        onSuccess={() => { setSelected(null); void load(); }}
        existingSession={selected ? sessions.find(session => session.platform === selected && session.status === PlatformStatus.CONNECTED) || null : null}
      />
    </View>
  );
}
