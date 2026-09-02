import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Plus, Trash2 } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { MobileHeader } from '../../components/mobile/claire-mobile';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { usePlatformStore } from '../../stores/platformStore';
import { profilesApi } from '../../services/profiles';

const PROFILE_COLORS = ['#7C6EF6', '#38A169', '#3182CE', '#D53F8C', '#D69E2E'];

export function ProfileSettingsScreen() {
  const userId = useAuthStore((state) => state.user?.id);
  const profiles = useProfileStore((state) => state.profiles);
  const activeProfileId = useProfileStore((state) => state.activeProfileId);
  const createProfile = useProfileStore((state) => state.createProfile);
  const refresh = useProfileStore((state) => state.refresh);
  const sessions = usePlatformStore((state) => state.connectedSessions);
  const refreshSessions = usePlatformStore((state) => state.fetchConnectedSessions);
  const [name, setName] = useState('Work');
  const [color, setColor] = useState(PROFILE_COLORS[1]);
  const [saving, setSaving] = useState(false);
  const add = async () => {
    if (!userId || !name.trim()) return;
    setSaving(true);
    try { await createProfile(userId, name.trim(), color); setName(''); }
    catch (error) { Alert.alert('Could not create profile', error instanceof Error ? error.message : 'Try again.'); }
    finally { setSaving(false); }
  };
  const remove = (profileId: string, profileName: string) => Alert.alert(`Delete ${profileName}?`, 'Move or disconnect all connected accounts first. This cannot delete the Personal profile.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => void profilesApi.remove(profileId).then(refresh).catch((error) => Alert.alert('Could not delete profile', error instanceof Error ? error.message : 'Try again.')) },
  ]);
  const moveSession = (sessionId: string, platform: string) => {
    const destinations = profiles.filter((profile) => profile.id !== activeProfileId);
    if (!destinations.length) { Alert.alert('Create another profile first', 'Accounts can only move to another profile.'); return; }
    Alert.alert(`Move ${platform}?`, 'Its conversations and history will move with this account.', [
      { text: 'Cancel', style: 'cancel' },
      ...destinations.map((destination) => ({ text: destination.name, onPress: () => void profilesApi.moveSession(destination.id, sessionId).then(async () => { await Promise.all([refresh(), refreshSessions()]); }).catch((error) => Alert.alert('Could not move account', error instanceof Error ? error.message : 'Try again.')) })),
    ]);
  };
  return <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 72 }}>
    <MobileHeader title="Profiles" subtitle="Keep your accounts, conversations, AI, and notifications in separate workspaces." />
    <View style={{ paddingHorizontal: space[4], gap: space[4] }}>
      <View style={{ padding: space[4], borderRadius: radius.card, backgroundColor: colors.sky, gap: space[3] }}>
        <Text style={{ ...mobileType.sectionTitle, color: colors.ink }}>Add a profile</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Profile name" placeholderTextColor={colors.neutral[400]} style={{ minHeight: 46, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.paper, color: colors.ink, borderWidth: 1, borderColor: colors.neutral[200] }} />
        <View style={{ flexDirection: 'row', gap: 10 }}>{PROFILE_COLORS.map((value) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`Use ${value} color`} onPress={() => setColor(value)} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: value, borderWidth: color === value ? 3 : 0, borderColor: colors.ink }} />)}</View>
        <Pressable disabled={saving || !name.trim()} onPress={() => void add()} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, backgroundColor: colors.ink, opacity: saving || !name.trim() ? 0.5 : 1 }}><Plus size={17} color={colors.paper} /><Text style={{ ...mobileType.label, color: colors.paper }}>{saving ? 'Adding…' : 'Add profile'}</Text></Pressable>
      </View>
      <View style={{ gap: space[2] }}>{profiles.map((profile) => <View key={profile.id} style={{ minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, padding: space[3], borderRadius: 15, backgroundColor: colors.paper, borderWidth: 1, borderColor: profile.id === activeProfileId ? colors.ink : colors.neutral[200] }}>
        <View style={{ width: 16, height: 16, borderRadius: 99, backgroundColor: profile.color }} />
        <View style={{ flex: 1 }}><Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{profile.name}{profile.is_personal ? ' · Default' : ''}</Text><Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{profile.unreadCount ? `${profile.unreadCount} unread` : 'No unread conversations'}</Text></View>
        {!profile.is_personal ? <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${profile.name}`} onPress={() => remove(profile.id, profile.name)} style={{ padding: 8 }}><Trash2 size={18} color={colors.danger} /></Pressable> : null}
      </View>)}</View>
      {sessions.length ? <View style={{ gap: space[2] }}><Text style={{ ...mobileType.sectionTitle, color: colors.ink }}>Connected accounts</Text>{sessions.map((session) => <View key={session.id} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, padding: space[3], borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200] }}><View style={{ flex: 1 }}><Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{session.platform[0].toUpperCase() + session.platform.slice(1)}</Text><Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>This profile</Text></View><Pressable accessibilityRole="button" onPress={() => moveSession(session.id, session.platform)} style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 99, borderWidth: 1, borderColor: colors.neutral[200] }}><Text style={{ ...mobileType.label, color: colors.ink }}>Move</Text></Pressable></View>)}</View> : null}
      <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>The active profile changes the entire workspace. Incoming notifications retain each profile’s own settings even when you are viewing another one.</Text>
    </View>
  </ScrollView>;
}
