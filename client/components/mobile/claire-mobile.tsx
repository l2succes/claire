import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { AlertCircle, Inbox, UserRound } from 'lucide-react-native';
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

export function MobileHeader({ title, eyebrow, subtitle, actions, profile }: { title: string; eyebrow?: string; subtitle?: string; actions?: ReactNode; profile?: ReactNode }) {
  return (
    <View style={{ paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: space[4], gap: space[1] }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[3] }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {eyebrow ? <Text selectable style={{ ...mobileType.monoLabel, color: colors.neutral[600], textTransform: 'uppercase' }}>{eyebrow}</Text> : null}
          <Text selectable style={{ ...mobileType.screenTitle, color: colors.ink }}>{title}</Text>
          {subtitle ? <Text selectable style={{ ...mobileType.bodySmall, color: colors.neutral[600], paddingTop: 2 }}>{subtitle}</Text> : null}
        </View>
        {actions}
        {profile}
      </View>
    </View>
  );
}

export function MobileIconButton({ children, label, onPress, selected = false, testID }: { children: ReactNode; label: string; onPress: () => void; selected?: boolean; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 14,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: selected ? colors.ink : colors.neutral[200],
        backgroundColor: selected ? colors.lime : colors.paper,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

export function MobileSearchField({ icon, style, inputStyle, ...props }: Omit<TextInputProps, 'style'> & { icon?: ReactNode; style?: StyleProp<ViewStyle>; inputStyle?: StyleProp<TextStyle> }) {
  return (
    <View style={[{ minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[3], backgroundColor: colors.neutral[100], borderRadius: 14, borderCurve: 'continuous' }, style]}>
      {icon}
      <TextInput
        {...props}
        placeholderTextColor={props.placeholderTextColor || colors.neutral[400]}
        style={[{ flex: 1, minHeight: 44, paddingVertical: 0, ...mobileType.body, color: colors.ink }, inputStyle]}
      />
    </View>
  );
}

export function MobileChip({ label, active, count, onPress, testID }: { label: string; active?: boolean; count?: number; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 36,
        paddingHorizontal: 13,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: active ? colors.ink : colors.neutral[200],
        backgroundColor: active ? colors.ink : colors.paper,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <Text style={{ ...mobileType.label, color: active ? colors.paper : colors.neutral[800] }}>{label}{typeof count === 'number' && count > 0 ? ` ${count}` : ''}</Text>
    </Pressable>
  );
}

export function SectionLabel({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space[2], paddingHorizontal: 2 }}>
      <Text selectable style={{ ...mobileType.monoLabel, color: colors.neutral[800], textTransform: 'uppercase' }}>{title}</Text>
      {detail ? <Text selectable style={{ ...mobileType.monoLabel, color: colors.neutral[400], textTransform: 'uppercase' }}>{detail}</Text> : null}
    </View>
  );
}

const avatarTones = [colors.blush, colors.sky, colors.mint, colors.lavender] as const;

export function MobileAvatar({ name, uri, size = 46, isGroup = false, badge }: { name: string; uri?: string | null; size?: number; isGroup?: boolean; badge?: ReactNode }) {
  const hash = [...name].reduce((total, character) => total + character.charCodeAt(0), 0);
  const tone = avatarTones[hash % avatarTones.length];
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';
  return (
    <View style={{ width: size, height: size, flexShrink: 0 }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tone, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
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
