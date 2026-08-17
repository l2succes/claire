import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { AlertCircle, Inbox, UserRound } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, mobileType, radius, space } from '@claire/design-system';

export const mobileColors = colors;

export function MobileScreen({ children, scroll = false, testID }: { children: ReactNode; scroll?: boolean; testID?: string }) {
  if (scroll) {
    return (
      <ScrollView
        testID={testID}
        style={{ flex: 1, backgroundColor: colors.cream }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 112, gap: space[4] }}
      >
        {children}
      </ScrollView>
    );
  }
  return <View testID={testID} style={{ flex: 1, backgroundColor: colors.cream }}>{children}</View>;
}

export function MobileHeader({ title, eyebrow, subtitle, leading, actions, profile, safeArea = false }: { title: string; eyebrow?: string; subtitle?: string; leading?: ReactNode; actions?: ReactNode; profile?: ReactNode; safeArea?: boolean }) {
  const { top } = useSafeAreaInsets();
  // ScrollView/FlatList with automatic inset adjustment already owns this
  // space. View-rooted tab screens need to add it explicitly.
  const safeTop = safeArea ? Math.max(top, process.env.EXPO_OS === 'ios' ? 48 : 0) : 0;
  const stacked = Boolean(leading);

  return (
    <View style={{ paddingHorizontal: space[4], paddingTop: Math.max(space[2], safeTop + space[2]), paddingBottom: space[3], gap: stacked ? space[3] : 2 }}>
      {stacked ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 40 }}>
          {leading}
          <View style={{ flex: 1 }} />
          {actions}
        </View>
      ) : null}
      <View style={{ flexDirection: stacked ? 'column' : 'row', alignItems: stacked ? 'flex-start' : 'center', gap: stacked ? 2 : space[3] }}>
        {stacked ? null : leading}
        <View style={{ flex: stacked ? undefined : 1, width: stacked ? '100%' : undefined, minWidth: 0 }}>
          {eyebrow ? <Text selectable maxFontSizeMultiplier={1} style={{ ...mobileType.monoLabel, color: colors.neutral[600], textTransform: 'uppercase' }}>{eyebrow}</Text> : null}
          <Text selectable maxFontSizeMultiplier={1} style={{ ...mobileType.screenTitle, color: colors.ink }}>{title}</Text>
          {subtitle ? <Text selectable maxFontSizeMultiplier={1} numberOfLines={stacked ? undefined : 1} style={{ ...mobileType.bodySmall, color: colors.neutral[600], paddingTop: 1 }}>{subtitle}</Text> : null}
        </View>
        {stacked ? null : actions}
        {profile}
      </View>
    </View>
  );
}

export function MobileIconButton({ children, label, onPress, selected = false, testID }: { children: ReactNode; label: string; onPress: () => void; selected?: boolean; testID?: string }) {
  const scale = useSharedValue(1);
  const press = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      onPressIn={() => { scale.value = withTiming(0.92, { duration: 80 }); }}
      onPressOut={() => { scale.value = withTiming(1, { duration: 160 }); }}
    >
      <Animated.View
        style={[{
          width: 40,
          height: 40,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 13,
          borderCurve: 'continuous',
          borderWidth: 1,
          borderColor: selected ? colors.ink : colors.neutral[200],
          backgroundColor: selected ? colors.lime : colors.paper,
        }, press]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

export function MobileSearchField({ icon, style, inputStyle, ...props }: Omit<TextInputProps, 'style'> & { icon?: ReactNode; style?: StyleProp<ViewStyle>; inputStyle?: StyleProp<TextStyle> }) {
  return (
    <View style={[{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[3], backgroundColor: colors.neutral[100], borderRadius: 13, borderCurve: 'continuous', borderWidth: 1, borderColor: 'transparent' }, style]}>
      {icon}
      <TextInput
        {...props}
        maxFontSizeMultiplier={1}
        placeholderTextColor={props.placeholderTextColor || colors.neutral[400]}
        textAlignVertical="center"
        style={[{ flex: 1, minHeight: 42, paddingTop: 0, paddingBottom: 0, ...mobileType.body, color: colors.ink }, inputStyle]}
      />
    </View>
  );
}

export function MobileChip({ label, active, count, onPress, testID, icon }: { label: string; active?: boolean; count?: number; onPress: () => void; testID?: string; icon?: ReactNode }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        minHeight: 32,
        paddingHorizontal: 11,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: active ? colors.ink : colors.neutral[200],
        backgroundColor: active ? colors.ink : colors.paper,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      {icon}
      <Text maxFontSizeMultiplier={1} style={{ ...mobileType.label, color: active ? colors.paper : colors.neutral[800] }}>{label}{typeof count === 'number' && count > 0 ? ` ${count}` : ''}</Text>
    </Pressable>
  );
}

export function SectionLabel({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space[2], paddingHorizontal: 2 }}>
      <Text selectable maxFontSizeMultiplier={1} style={{ ...mobileType.monoLabel, color: colors.neutral[800], textTransform: 'uppercase' }}>{title}</Text>
      {detail ? <Text selectable maxFontSizeMultiplier={1} style={{ ...mobileType.monoLabel, color: colors.neutral[400], textTransform: 'uppercase' }}>{detail}</Text> : null}
    </View>
  );
}

const avatarTones = [colors.blush, colors.sky, colors.mint, colors.lavender] as const;

export function MobileAvatar({ name, uri, size = 46, isGroup = false, badge, tone }: { name: string; uri?: string | null; size?: number; isGroup?: boolean; badge?: ReactNode; tone?: string }) {
  const hash = [...name].reduce((total, character) => total + character.charCodeAt(0), 0);
  const background = tone || avatarTones[hash % avatarTones.length];
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';
  return (
    <View style={{ width: size, height: size, flexShrink: 0 }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: background, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {uri ? <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" transition={120} /> : isGroup ? <UserRound size={size * 0.48} color={colors.neutral[600]} /> : <Text style={{ ...mobileType.label, color: colors.ink }}>{initials}</Text>}
      </View>
      {badge ? <View style={{ position: 'absolute', right: -3, bottom: -2 }}>{badge}</View> : null}
    </View>
  );
}

export function MobileState({ title, message, error = false, action }: { title: string; message: string; error?: boolean; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[8], paddingVertical: 72, gap: space[3] }}>
      <View style={{ width: 54, height: 54, borderRadius: 18, backgroundColor: error ? colors.blush : colors.sky, alignItems: 'center', justifyContent: 'center' }}>
        {error ? <AlertCircle size={24} color={colors.danger} /> : <Inbox size={24} color={colors.ink} />}
      </View>
      <Text selectable style={{ ...mobileType.sectionTitle, textAlign: 'center', color: colors.ink }}>{title}</Text>
      <Text selectable style={{ ...mobileType.bodySmall, textAlign: 'center', color: colors.neutral[600] }}>{message}</Text>
      {action}
    </View>
  );
}
