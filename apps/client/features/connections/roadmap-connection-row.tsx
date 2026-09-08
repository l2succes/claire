import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Check } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';
import type { PlatformDefinition } from '../../services/platforms';

export function RoadmapConnectionRow({
  definition,
  requested,
  onRequest,
  isLast = false,
}: {
  definition: PlatformDefinition;
  requested: boolean;
  onRequest: () => void;
  isLast?: boolean;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <View
      testID={`roadmap-connection-${definition.id}`}
      style={{
        minHeight: 78,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingVertical: space[3],
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.neutral[200],
      }}
    >
      <View
        style={{
          width: 46,
          height: 46,
          flexShrink: 0,
          borderRadius: 15,
          backgroundColor: definition.accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {definition.iconUrl ? (
          <Image source={{ uri: definition.iconUrl }} style={{ width: 22, height: 22 }} contentFit="contain" />
        ) : (
          <Text style={{ ...mobileType.label, fontWeight: '800', color: colors.paper }}>
            {definition.mark}
          </Text>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text numberOfLines={1} style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>
          {definition.name}
        </Text>
        <Text numberOfLines={2} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
          {definition.detail}
        </Text>
      </View>
      <Pressable
        testID={`roadmap-request-${definition.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${requested ? 'Requested' : 'Request'} ${definition.name}`}
        accessibilityState={{ disabled: requested }}
        disabled={requested}
        onPress={onRequest}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={{
          minWidth: 88,
          minHeight: 40,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          paddingHorizontal: 12,
          borderRadius: radius.pill,
          borderWidth: requested ? 0 : 1,
          borderColor: colors.ink,
          backgroundColor: requested ? colors.lime : colors.paper,
          opacity: pressed ? 0.68 : 1,
        }}
      >
        {requested ? <Check size={14} color={colors.ink} /> : null}
        <Text style={{ ...mobileType.label, fontWeight: '800', color: colors.ink }}>
          {requested ? 'Requested' : 'Request'}
        </Text>
      </Pressable>
    </View>
  );
}
