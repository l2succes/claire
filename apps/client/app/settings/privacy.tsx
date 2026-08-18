import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { ChevronLeft, DatabaseZap, ShieldCheck, Trash2 } from 'lucide-react-native';
import { router } from 'expo-router';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { MobileHeader, MobileIconButton, SectionLabel } from '../../components/mobile/claire-mobile';
import { clearMobileCache, hydrateMobileCache, setFullHistoryEnabled, usesNativeMobileCache, type MobileCacheSnapshot } from '../../services/mobile-cache';
import { backfillFullMobileHistory } from '../../services/mobile-sync';
import { useAuthStore } from '../../stores/authStore';

export default function PrivacyDataSettingsScreen() {
  const user = useAuthStore(state => state.user);
  const token = useAuthStore(state => state.token);
  const [snapshot, setSnapshot] = useState<MobileCacheSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [backfill, setBackfill] = useState<string | null>(null);
  const native = usesNativeMobileCache();

  const refresh = useCallback(async () => {
    if (!user?.id || !native) return;
    setSnapshot(await hydrateMobileCache(user.id));
  }, [native, user?.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  const toggleHistory = async (enabled: boolean) => {
    if (!user?.id) return;
    setBusy(true);
    try {
      await setFullHistoryEnabled(user.id, enabled);
      await refresh();
      if (enabled && token) {
        setBackfill('Saving older conversations…');
        await backfillFullMobileHistory(user.id, token, (count, chats) => setBackfill(`Saving older conversations… ${count} messages across ${chats} chats`));
        setBackfill('Full history is available offline.');
      } else setBackfill(null);
    } catch {
      Alert.alert('Couldn’t update local history', 'Your server conversations are unchanged. Try again while online.');
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const clear = () => Alert.alert('Clear local data?', 'This removes encrypted messages and preferences stored on this device. Your synced Claire history stays available online.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Clear local data', style: 'destructive', onPress: async () => {
      if (!user?.id) return;
      setBusy(true);
      try { await clearMobileCache(user.id); await refresh(); }
      finally { setBusy(false); }
    } },
  ]);

  return (
    <ScrollView testID="privacy-data-settings-screen" style={{ flex: 1, backgroundColor: colors.cream }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 112 }}>
      <MobileHeader title="Privacy & data" subtitle="Your messages stay private on this device." leading={<MobileIconButton label="Back to Settings" onPress={() => router.replace('/settings')}><ChevronLeft size={20} color={colors.ink} /></MobileIconButton>} />
      <View style={{ paddingHorizontal: space[4], gap: space[5] }}>
        {!native ? <View style={{ padding: space[4], borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200] }}><Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>Private browser session</Text><Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Web does not store message history on this browser.</Text></View> : <>
          <View style={{ padding: space[4], gap: space[2], borderRadius: radius.card, backgroundColor: colors.sky, borderWidth: 1, borderColor: colors.ink }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}><ShieldCheck size={20} color={colors.ink} /><Text style={{ ...mobileType.body, fontWeight: '800', color: colors.ink }}>Encrypted on this device</Text></View>
            <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Claire uses an account-specific encrypted database. Its key stays in your device’s secure key store.</Text>
            <Text style={{ ...mobileType.label, color: colors.neutral[600] }}>{snapshot?.lastSyncAt ? `Last local sync ${new Date(snapshot.lastSyncAt).toLocaleString()}` : 'Preparing your local cache…'}</Text>
          </View>

          <View style={{ gap: space[2] }}>
            <SectionLabel title="Offline history" />
            <View style={{ padding: space[4], gap: space[3], borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200] }}>
              <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}><View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: colors.lavender, alignItems: 'center', justifyContent: 'center' }}><DatabaseZap size={22} color={colors.ink} /></View><View style={{ flex: 1, gap: 2 }}><Text style={{ ...mobileType.body, fontWeight: '800', color: colors.ink }}>Keep full text history</Text><Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Recent chats are always cached. Archive all synced text for offline use.</Text></View><Switch testID="privacy-full-history-toggle" value={snapshot?.fullHistoryEnabled ?? false} onValueChange={toggleHistory} disabled={busy} trackColor={{ true: colors.lime }} /></View>
              {backfill ? <Text style={{ ...mobileType.label, color: colors.neutral[600] }}>{backfill}</Text> : null}
            </View>
          </View>

          <View style={{ gap: space[2], paddingTop: space[2] }}>
            <SectionLabel title="On this device" />
            <View style={{ padding: space[4], gap: space[3], borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200] }}>
              <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}><Trash2 size={20} color={colors.danger} /><View style={{ flex: 1 }}><Text style={{ ...mobileType.body, fontWeight: '800', color: colors.ink }}>Remove offline copy</Text><Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Your synced Claire history stays online.</Text></View></View>
              <Pressable testID="privacy-clear-local-data" onPress={clear} disabled={busy} style={({ pressed }) => ({ minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2], borderRadius: radius.control, backgroundColor: pressed ? colors.blush : '#FFF5F4', borderWidth: 1, borderColor: colors.blush, opacity: busy ? 0.6 : 1 })}><Trash2 size={17} color={colors.danger} /><Text style={{ ...mobileType.label, fontWeight: '800', color: colors.danger }}>Clear local data</Text>{busy ? <ActivityIndicator size="small" color={colors.danger} /> : null}</Pressable>
            </View>
          </View>
        </>}
      </View>
    </ScrollView>
  );
}
