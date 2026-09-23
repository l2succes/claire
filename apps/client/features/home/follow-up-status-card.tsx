import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AlertCircle, BellOff } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { useLoopHealth } from '../../hooks/useLoopAttention';

export function FollowUpStatusCard() {
  const { issue, message, isError, refetch } = useLoopHealth();
  if (!message && !isError) return null;
  const isPushIssue = issue === 'push';
  return (
    <View style={{ flexDirection: 'row', gap: space[3], padding: space[4], borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.card, backgroundColor: colors.paper }}>
      {isPushIssue ? <BellOff size={21} color={colors.ink} /> : <AlertCircle size={21} color={colors.ink} />}
      <View style={{ flex: 1, gap: space[2] }}>
        <Text style={{ ...mobileType.bodySmall, fontWeight: '800', color: colors.ink }}>{isPushIssue ? 'Push alerts need attention' : 'Follow-up status'}</Text>
        <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{message || 'Claire could not check follow-up status.'}</Text>
        {issue === 'sync' ? null : (
          <Pressable accessibilityRole="button" onPress={() => isError ? void refetch() : router.push(isPushIssue ? '/settings/notifications' : '/settings')} style={{ alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' }}>
            <Text style={{ ...mobileType.bodySmall, fontWeight: '800', color: colors.ink }}>{isError ? 'Try again' : isPushIssue ? 'Set up push alerts' : 'Open settings'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
