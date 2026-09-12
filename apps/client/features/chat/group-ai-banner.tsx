/**
 * "Claire isn't reading this group — turn it on?"
 *
 * Groups are opt-in, which is only defensible if the user can find the switch.
 * This is that discovery path. The copy is driven by the inferred category so
 * the offer is concrete ("track action items and what you owe") rather than
 * abstract ("enable AI"), which is the difference between a decision someone
 * can make and one they defer forever.
 *
 * Dismissal is local to the device: the banner is discovery, the toggle is the
 * durable state. Someone who dismisses this on their phone has not made a
 * decision worth syncing.
 */
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { Users } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';

import type { GroupCategory } from '../../types/conversationSettings';
import { groupBannerCopy } from './group-category';

interface Props {
  category: GroupCategory | null;
  categoryConfidence: number | null;
  memberCount: number | null;
  onEnable: () => Promise<void>;
  onDismiss: () => void;
  testID?: string;
}

export function GroupAiBanner({
  category,
  categoryConfidence,
  memberCount,
  onEnable,
  onDismiss,
  testID = 'chat-group-ai-banner',
}: Props) {
  const [busy, setBusy] = useState(false);
  const [pressed, setPressed] = useState(false);
  const copy = groupBannerCopy(category, categoryConfidence, memberCount);

  const enable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onEnable();
    } catch {
      // try/finally with no catch turned any failure into an unhandled promise
      // rejection, which shows the user a raw "Uncaught (in promise) Error"
      // instead of anything actionable. The mute switch in chat settings
      // handles the same class of failure this way; match it. The banner stays
      // up, so the offer is still there to retry.
      Alert.alert('Could not turn on Claire', 'Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      testID={testID}
      style={{
        marginHorizontal: space[3],
        marginTop: space[2],
        padding: space[3],
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        borderRadius: radius.control,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: colors.ink,
        backgroundColor: colors.sky,
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 9,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: copy.recommended ? colors.lime : colors.paper,
        }}
      >
        <Users size={15} color={colors.ink} />
      </View>

      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text
          maxFontSizeMultiplier={1.2}
          numberOfLines={1}
          style={{ ...mobileType.label, color: colors.ink }}
        >
          {copy.title}
        </Text>
        <Text
          maxFontSizeMultiplier={1.2}
          numberOfLines={2}
          style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}
        >
          {copy.body}
        </Text>
      </View>

      {/* Pressable's ({ pressed }) => style callback is dropped by NativeWind's
          interop wrapper, which would leave this row with no style at all. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Turn on Claire for this group"
        testID="chat-group-ai-enable"
        disabled={busy}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onPress={() => void enable()}
        style={{
          minHeight: 32,
          minWidth: 74,
          paddingHorizontal: 12,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: colors.ink,
          backgroundColor: copy.recommended ? colors.lime : colors.paper,
          opacity: busy || pressed ? 0.6 : 1,
        }}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.ink} />
        ) : (
          <Text maxFontSizeMultiplier={1.2} style={{ ...mobileType.label, color: colors.ink }}>
            Turn on
          </Text>
        )}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        testID="chat-group-ai-dismiss"
        onPress={onDismiss}
        hitSlop={8}
        style={{ paddingHorizontal: 2 }}
      >
        <Text maxFontSizeMultiplier={1} style={{ ...mobileType.label, color: colors.neutral[600] }}>
          ✕
        </Text>
      </Pressable>
    </View>
  );
}
