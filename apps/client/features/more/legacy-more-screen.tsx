import { Pressable, ScrollView, Text, View } from 'react-native';
import { ChevronRight, Link2, Search, Settings, UsersRound } from 'lucide-react-native';
import { router } from 'expo-router';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { MobileHeader } from '../../components/mobile/claire-mobile';

const destinations = [
  { title: 'Search', detail: 'Messages, people, files, and loops', icon: Search, href: '/(tabs)/search' },
  { title: 'People', detail: 'Contacts and relationship context', icon: UsersRound, href: '/people' },
  { title: 'Connections', detail: 'Messaging accounts and setup', icon: Link2, href: '/connections' },
  { title: 'Settings', detail: 'Notifications, AI, and account controls', icon: Settings, href: '/settings' },
] as const;

export function LegacyMoreScreen() {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 104 }} testID="more-screen">
      <MobileHeader title="More" subtitle="Everything that supports your conversations." safeArea />
      <View style={{ paddingHorizontal: space[4], paddingTop: space[2], gap: space[3] }}>
        {destinations.map(destination => {
          const Icon = destination.icon;
          return <Pressable key={destination.title} testID={`more-${destination.title.toLowerCase()}`} accessibilityRole="button" accessibilityLabel={`${destination.title}. ${destination.detail}`} onPress={() => router.push(destination.href as never)} style={{ width: '100%' }}>
            <View style={{ minHeight: 82, width: '100%', flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.control, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper, boxShadow: '0 1px 2px rgba(16,18,15,0.04)' }}>
              <View style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.neutral[100] }}><Icon size={21} color={colors.ink} /></View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}><Text maxFontSizeMultiplier={1} style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{destination.title}</Text><Text maxFontSizeMultiplier={1} numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{destination.detail}</Text></View>
              <ChevronRight size={20} color={colors.neutral[400]} />
            </View>
          </Pressable>;
        })}
      </View>
    </ScrollView>
  );
}
