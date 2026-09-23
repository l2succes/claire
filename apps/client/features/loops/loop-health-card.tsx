import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { useLoopHealth } from '../../hooks/useLoopAttention';

export function LoopHealthCard() {
  const { message, isError, refetch } = useLoopHealth();
  if (!message && !isError) return null;
  return <View style={{ backgroundColor: colors.cream, padding: space[3], borderRadius: radius.card, gap: space[2] }}>
    <Text style={{ ...mobileType.bodySmall, color: colors.ink }}>{message || 'Claire could not check follow-up delivery.'}</Text>
    <Pressable accessibilityRole="button" onPress={() => isError ? void refetch() : router.push('/settings')}
      style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={{ ...mobileType.bodySmall, color: colors.ink, fontWeight: '700' }}>{isError ? 'Try again' : 'Open settings'}</Text>
    </Pressable>
  </View>;
}
