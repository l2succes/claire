import { Pressable, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import {
  ChatBubbleLeftRightIcon,
  CheckBadgeIcon,
  EllipsisHorizontalIcon,
  HomeIcon,
} from 'react-native-heroicons/outline';
import { colors } from '@claire/design-system';
import { useChromeStore } from '../../stores/chromeStore';
import { ClaireMark } from './mark';

const ICONS = {
  dashboard: HomeIcon,
  messages: ChatBubbleLeftRightIcon,
  promises: CheckBadgeIcon,
  more: EllipsisHorizontalIcon,
} as const;

export function ClaireTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const hidden = useChromeStore((current) => current.tabBarHidden);
  const { bottom } = useSafeAreaInsets();
  if (hidden) return null;

  const items = state.routes.filter((route) => descriptors[route.key].options.href !== null);
  const slot = 44;
  const pad = 10;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingBottom: Math.max(bottom, 8) }}
    >
      <View
        testID="claire-tab-bar"
        style={{
          width: pad * 2 + items.length * slot,
          height: 58,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: pad,
          borderRadius: 22,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: 'rgba(16,18,15,0.10)',
          boxShadow: '0 8px 25px rgba(16,18,15,0.10)',
        }}
      >
        <BlurView intensity={48} tint="light" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255,253,248,0.42)' }} />
        {items.map((route) => {
            const index = state.routes.indexOf(route);
            const focused = state.index === index;
            const { options } = descriptors[route.key];
            const label = options.title || route.name;
            const onPress = () => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
            };
            const badge = options.tabBarBadge;
            const isAsk = route.name === 'ask-claire';
            const Icon = ICONS[route.name as keyof typeof ICONS];

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: focused }}
                onPress={onPress}
                testID={`tab-${route.name}`}
                style={{ width: slot, height: 48, alignItems: 'center', justifyContent: 'center' }}
              >
                {isAsk ? (
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 13,
                      borderWidth: 1,
                      borderColor: colors.ink,
                      backgroundColor: colors.lime,
                      boxShadow: '0 5px 14px rgba(223,255,100,0.38)',
                    }}
                  >
                    <ClaireMark size={22} />
                  </View>
                ) : (
                  <View>
                    {Icon ? <Icon size={28} color={focused ? colors.ink : colors.neutral[400]} strokeWidth={1.7} /> : null}
                    {badge ? (
                      <View style={{ position: 'absolute', top: -7, right: -11, minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: colors.paper, fontSize: 9, fontWeight: '700' }}>{badge}</Text>
                      </View>
                    ) : null}
                  </View>
                )}
              </Pressable>
            );
          })}
      </View>
    </View>
  );
}
