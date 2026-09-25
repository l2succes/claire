import { Pressable, Text, useWindowDimensions, View } from 'react-native';
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
  loops: CheckBadgeIcon,
  more: EllipsisHorizontalIcon,
} as const;

const TAB_ORDER = ['dashboard', 'messages', 'ask-claire', 'loops', 'more'] as const;

export function ClaireTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const hidden = useChromeStore((current) => current.tabBarHidden);
  const { bottom } = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  if (hidden) return null;

  // Expo file routes still register contacts and search as tabs. href: null hides
  // them from the system bar, but a custom tabBar receives every route, so keep
  // the visible set explicit.
  const items = TAB_ORDER.map((name) => state.routes.find((route) => route.name === name)).filter(
    (route): route is (typeof state.routes)[number] => Boolean(route),
  );
  // Native iOS Liquid Glass groups an icon-only five-tab bar into a 2–1–2
  // layout. This glass shell keeps five equal slots, including the Claire tab.
  const barWidth = Math.min(windowWidth - 28, 390);

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        paddingBottom: Math.max(bottom, 8),
      }}
    >
      <View
        testID="claire-tab-bar"
        style={{
          width: barWidth,
          height: 64,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 8,
          borderRadius: 32,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: 'rgba(16,18,15,0.10)',
          boxShadow: '0 8px 25px rgba(16,18,15,0.10)',
        }}
      >
        <BlurView
          intensity={68}
          tint="light"
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: 'rgba(255,253,248,0.28)',
          }}
        />
        {items.map((route) => {
          const index = state.routes.indexOf(route);
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const label = options.title || route.name;
          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
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
              style={{ flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 22,
                  backgroundColor: focused ? 'rgba(255,255,255,0.52)' : 'transparent',
                }}
              >
                {isAsk ? (
                  <ClaireMark
                    size={22}
                    strokeWidth={4}
                    color={focused ? colors.ink : colors.neutral[400]}
                  />
                ) : (
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {Icon ? (
                      <Icon
                        size={28}
                        color={focused ? colors.ink : colors.neutral[400]}
                        strokeWidth={1.7}
                      />
                    ) : null}
                    {badge ? (
                      <View
                        style={{
                          position: 'absolute',
                          top: -7,
                          right: -12,
                          minWidth: 16,
                          height: 16,
                          paddingHorizontal: 4,
                          borderRadius: 8,
                          backgroundColor: colors.ink,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ color: colors.paper, fontSize: 9, fontWeight: '700' }}>
                          {badge}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
