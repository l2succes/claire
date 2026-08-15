import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Check, ChevronLeft, Laptop, Plus, RefreshCw, Smartphone } from 'lucide-react-native';
import { router } from 'expo-router';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { platformsApi, type PlatformDefinition } from '../../services/platforms';
import { usePlatformStore } from '../../stores/platformStore';
import { Platform, PlatformStatus } from '../../types/platform';
import { PlatformAuthModal } from '../../components/PlatformAuthModal';
import { MobileHeader, MobileIconButton, MobileState, SectionLabel } from '../../components/mobile/claire-mobile';

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
      const [catalog, interests] = await Promise.all([platformsApi.getPlatformDefinitions(), platformsApi.getPlatformInterests(), fetchSessions()]);
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

  const renderCard = (definition: PlatformDefinition) => {
    const connected = connectedPlatforms.has(definition.id as Platform);
    const isRequested = requested.includes(definition.id);
    const mobileSetup = canConnectOnMobile(definition);
    const actionLabel = connected ? 'Connected' : isRequested ? 'Requested' : mobileSetup ? 'Connect' : definition.setupSurface === 'desktop' || definition.setupSurface === 'mac' ? 'Use Claire Desktop' : 'Join waitlist';
    return <Pressable key={definition.id} accessibilityRole="button" onPress={() => void act(definition)} style={({ pressed }) => ({ minHeight: 86, padding: space[3], gap: space[2], borderRadius: radius.card, borderWidth: 1, borderColor: connected ? colors.success : colors.neutral[200], backgroundColor: colors.paper, opacity: pressed ? 0.72 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}><View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: definition.accent, alignItems: 'center', justifyContent: 'center' }}>{definition.iconUrl ? <Image source={{ uri: definition.iconUrl }} style={{ width: 24, height: 24 }} contentFit="contain" /> : <Text style={{ ...mobileType.label, color: colors.paper }}>{definition.mark}</Text>}</View><View style={{ flex: 1 }}><Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{definition.name}</Text><Text style={{ ...mobileType.label, color: colors.neutral[600] }}>{definition.setupLabel}</Text></View></View>
      <Text numberOfLines={3} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{definition.detail}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: connected ? colors.successSurface : isRequested ? colors.sky : colors.neutral[100], alignItems: 'center', justifyContent: 'center' }}>{connected || isRequested ? <Check size={14} color={colors.ink} /> : mobileSetup ? <Smartphone size={14} color={colors.ink} /> : <Laptop size={14} color={colors.ink} />}</View><Text style={{ ...mobileType.label, color: colors.ink }}>{actionLabel}</Text></View>
    </Pressable>;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 48 }}>
        <MobileHeader title="Connections" subtitle="Bring your conversations into Claire." actions={<View style={{ flexDirection: 'row', gap: space[2] }}><MobileIconButton label="Back" onPress={() => router.back()}><ChevronLeft size={20} color={colors.ink} /></MobileIconButton><MobileIconButton label="Refresh connections" onPress={() => void load()}><RefreshCw size={18} color={colors.ink} /></MobileIconButton></View>} />
        {loading ? <ActivityIndicator style={{ marginTop: 80 }} color={colors.ink} /> : error ? <MobileState error title="Connections unavailable" message={error} /> : <View style={{ paddingHorizontal: space[4], gap: space[4] }}>
          <View style={{ padding: space[4], borderRadius: radius.card, backgroundColor: colors.ink, gap: space[2] }}><View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}><Plus size={19} color={colors.ink} /></View><Text style={{ ...mobileType.sectionTitle, color: colors.paper }}>One inbox, your choice of networks</Text><Text style={{ ...mobileType.bodySmall, color: colors.neutral[300] }}>Phone-safe setup happens here. Desktop-only connectors clearly tell you when Claire Desktop is required.</Text></View>
          <SectionLabel title="Connect now" />
          <View style={{ gap: space[2] }}>{definitions.filter(item => item.supportStatus === 'available' || item.supportStatus === 'beta').map(renderCard)}</View>
          <SectionLabel title="On the roadmap" detail="Vote with a tap" />
          <View style={{ gap: space[2] }}>{definitions.filter(item => item.supportStatus === 'planned' || item.supportStatus === 'unavailable').map(renderCard)}</View>
        </View>}
      </ScrollView>
      <PlatformAuthModal platform={selected} visible={!!selected} onClose={() => setSelected(null)} onSuccess={() => { setSelected(null); void load(); }} existingSession={selected ? sessions.find(session => session.platform === selected && session.status === PlatformStatus.CONNECTED) || null : null} />
    </View>
  );
}
