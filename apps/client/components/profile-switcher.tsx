import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Check, ChevronDown, Plus } from 'lucide-react-native';
import { router } from 'expo-router';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { useAuthStore } from '../stores/authStore';
import { useProfileStore } from '../stores/profileStore';
import { usePlatformStore } from '../stores/platformStore';

export function ProfileSwitcher() {
  const [open, setOpen] = useState(false);
  const userId = useAuthStore((state) => state.user?.id);
  const profiles = useProfileStore((state) => state.profiles);
  const activeProfileId = useProfileStore((state) => state.activeProfileId);
  const setActive = useProfileStore((state) => state.setActiveProfile);
  const refreshSessions = usePlatformStore((state) => state.fetchConnectedSessions);
  const active = profiles.find((profile) => profile.id === activeProfileId);
  if (!active || !userId) return null;
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Switch profile" onPress={() => setOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, minHeight: 32, borderRadius: 99, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200] }}>
      <View style={{ width: 9, height: 9, borderRadius: 99, backgroundColor: active.color }} />
      <Text numberOfLines={1} style={{ ...mobileType.label, maxWidth: 100, color: colors.ink }}>{active.name}</Text>
      <ChevronDown size={14} color={colors.neutral[600]} />
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable onPress={() => setOpen(false)} style={{ flex: 1, justifyContent: 'center', padding: space[5], backgroundColor: 'rgba(16,18,15,0.28)' }}>
        <Pressable onPress={(event) => event.stopPropagation()} style={{ borderRadius: radius.card, padding: space[4], gap: space[2], backgroundColor: colors.paper }}>
          <Text style={{ ...mobileType.sectionTitle, color: colors.ink }}>Switch profile</Text>
          {profiles.map((profile) => <Pressable key={profile.id} accessibilityRole="button" onPress={() => { void setActive(userId, profile.id).then(refreshSessions); setOpen(false); }} style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, borderRadius: 12, backgroundColor: profile.id === activeProfileId ? colors.sky : 'transparent' }}>
            <View style={{ width: 12, height: 12, borderRadius: 99, backgroundColor: profile.color }} />
            <View style={{ flex: 1 }}><Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{profile.name}</Text><Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{profile.unreadCount ? `${profile.unreadCount} unread` : 'All caught up'}</Text></View>
            {profile.id === activeProfileId ? <Check size={17} color={colors.ink} /> : null}
          </Pressable>)}
          <Pressable accessibilityRole="button" onPress={() => { setOpen(false); router.push('/settings/profiles'); }} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, borderWidth: 1, borderColor: colors.neutral[200] }}>
            <Plus size={16} color={colors.ink} /><Text style={{ ...mobileType.label, color: colors.ink }}>Manage profiles in Settings</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  </>;
}
