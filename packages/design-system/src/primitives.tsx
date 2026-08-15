import React, { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View, type ImageSourcePropType, type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle } from 'react-native';
import { colors, fonts, mobileType, radius, space, type ClaireTextVariant, type as desktopType } from './tokens';

const ClaireSurfaceContext = createContext<'desktop' | 'mobile'>('desktop');

export function ClaireThemeProvider({ children, surface }: { children: ReactNode; surface: 'desktop' | 'mobile' }) {
  return <ClaireSurfaceContext.Provider value={surface}>{children}</ClaireSurfaceContext.Provider>;
}

export function ClaireText({ variant = 'body', style, ...props }: TextProps & { variant?: ClaireTextVariant; style?: StyleProp<TextStyle> }) {
  const surface = useContext(ClaireSurfaceContext);
  const typeTokens = (surface === 'mobile' ? mobileType : desktopType) as Record<ClaireTextVariant, TextStyle>;
  return <Text {...props} style={[typeTokens[variant], styles.text, style]} />;
}

export function ClaireCard({ children, style, tone = 'paper' }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'paper' | 'cream' | 'mint' | 'sky' }) {
  return <View style={[styles.card, toneStyles[tone], style]}>{children}</View>;
}

export function ClaireButton({ children, onPress, variant = 'primary', disabled = false, style, accessibilityLabel }: { children: ReactNode; onPress?: () => void; variant?: 'primary' | 'secondary' | 'quiet'; disabled?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  const [focused, setFocused] = useState(false);
  const surface = useContext(ClaireSurfaceContext);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }} disabled={disabled} onBlur={() => setFocused(false)} onFocus={() => setFocused(true)} onPress={onPress} style={({ pressed }) => [styles.button, surface === 'mobile' && styles.mobileButton, buttonStyles[variant], focused && styles.focusRing, pressed && !disabled && styles.pressed, disabled && styles.disabled, style]}>
      <ClaireText variant="body" style={[styles.buttonText, variant === 'primary' ? styles.primaryButtonText : styles.secondaryButtonText]}>{children}</ClaireText>
    </Pressable>
  );
}

export function ClaireIconButton({ children, onPress, accessibilityLabel, disabled = false, style }: { children: ReactNode; onPress?: () => void; accessibilityLabel: string; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const [focused, setFocused] = useState(false);
  const surface = useContext(ClaireSurfaceContext);
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }} disabled={disabled} onBlur={() => setFocused(false)} onFocus={() => setFocused(true)} onPress={onPress} style={({ pressed }) => [styles.iconButton, surface === 'mobile' && styles.mobileIconButton, focused && styles.focusRing, pressed && !disabled && styles.pressed, disabled && styles.disabled, style]}>{children}</Pressable>;
}

export function ClaireField({ label, hint, error, style, ...props }: TextInputProps & { label?: string; hint?: string; error?: string; style?: StyleProp<TextStyle> }) {
  return <View style={styles.fieldGroup}>
    {label ? <ClaireText variant="label">{label}</ClaireText> : null}
    <TextInput {...props} accessibilityLabel={props.accessibilityLabel || label} placeholderTextColor={props.placeholderTextColor || colors.neutral[400]} style={[styles.field, Boolean(error) && styles.fieldError, style]} />
    {error ? <ClaireText variant="bodySmall" style={styles.errorText}>{error}</ClaireText> : hint ? <ClaireText variant="bodySmall" style={styles.hintText}>{hint}</ClaireText> : null}
  </View>;
}

export function ClaireDivider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View accessibilityElementsHidden style={[styles.divider, style]} />;
}

export function ClaireAvatar({ initials, size = 40, source, tone = 'mint' }: { initials: string; size?: number; source?: ImageSourcePropType; tone?: ClaireAvatarTone }) {
  // Broken remote avatar URLs must settle to initials. Leaving a failed Image
  // mounted makes native image loaders retry during parent re-renders.
  const [failed, setFailed] = useState(false);
  const sourceUri = typeof source === 'object' && source && !Array.isArray(source) && 'uri' in source ? source.uri : undefined;
  // Callers naturally create `{ uri }` inline. Keep the native source object
  // stable so a harmless parent render does not trigger another image request.
  const stableSource = useMemo<ImageSourcePropType | undefined>(() => sourceUri ? { uri: sourceUri } : source, [sourceUri]);
  return <View accessibilityLabel={`${initials} avatar`} style={[styles.avatar, avatarToneStyles[tone], { width: size, height: size, borderRadius: size / 2 }]}>{stableSource && !failed ? <Image source={stableSource} onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: size / 2 }} /> : <ClaireText variant="label">{initials}</ClaireText>}</View>;
}

export function ClaireStatusPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'info' }) {
  return <View style={[styles.pill, pillToneStyles[tone]]}><ClaireText variant="label" style={pillTextStyles[tone]}>{children}</ClaireText></View>;
}

export function ClairePlatformBadge({ platform }: { platform: string }) {
  return <View accessibilityLabel={`${platform} platform`} style={styles.platformBadge}><ClaireText variant="monoLabel" style={styles.platformBadgeText}>{platform}</ClaireText></View>;
}

export function ClaireMessageBubble({ children, fromMe = false, style }: { children: ReactNode; fromMe?: boolean; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.messageBubble, fromMe ? styles.messageBubbleMine : styles.messageBubbleTheirs, style]}>{children}</View>;
}

export type ClaireAvatarTone = 'mint' | 'sky' | 'blush' | 'lavender';

/**
 * The shared inbox-row contract. Hosts may compose this inside their own list
 * containers, but names, previews, badges, unread state, and pointer/accessibility
 * behavior remain consistent across Claire clients.
 */
export function ClaireConversationRow({
  name,
  preview,
  timestamp,
  platform,
  unreadCount,
  initials,
  avatarSource,
  avatarTone = 'mint',
  avatarOverlay,
  selected = false,
  onPress,
  style,
}: {
  name: string;
  preview: string;
  timestamp?: string;
  platform: string;
  unreadCount?: number;
  initials: string;
  avatarSource?: ImageSourcePropType;
  avatarTone?: ClaireAvatarTone;
  /** Optional host-rendered platform mark, positioned over the avatar. */
  avatarOverlay?: ReactNode;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const label = `${name}, ${platform} conversation${unreadCount ? `, ${unreadCount} unread` : ''}`;
  const [focused, setFocused] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onBlur={() => setFocused(false)} onFocus={() => setFocused(true)} onPress={onPress} style={({ pressed }) => [styles.conversationRow, selected && styles.conversationRowSelected, focused && styles.focusRing, pressed && styles.pressed, style]}>
    <View style={styles.conversationAvatarWrap}>
      <ClaireAvatar initials={initials} source={avatarSource} size={42} tone={avatarTone} />
      {avatarOverlay}
    </View>
    <View style={styles.conversationContent}>
      <View style={styles.conversationTopRow}><ClaireText variant="body" numberOfLines={1} style={styles.conversationName}>{name}</ClaireText>{timestamp ? <ClaireText variant="bodySmall" style={styles.conversationTimestamp}>{timestamp}</ClaireText> : null}</View>
      <View style={styles.conversationTopRow}><ClaireText variant="bodySmall" numberOfLines={1} style={styles.conversationPreview}>{preview}</ClaireText>{unreadCount ? <View accessibilityLabel={`${unreadCount} unread messages`} style={styles.unread}><ClaireText variant="label" style={styles.unreadText}>{unreadCount}</ClaireText></View> : null}</View>
      {!avatarOverlay ? <ClairePlatformBadge platform={platform} /> : null}
    </View>
  </Pressable>;
}

const toneStyles = StyleSheet.create({ paper: { backgroundColor: colors.paper }, cream: { backgroundColor: colors.cream }, mint: { backgroundColor: colors.mint }, sky: { backgroundColor: colors.sky } });
const buttonStyles = StyleSheet.create({ primary: { backgroundColor: colors.ink }, secondary: { backgroundColor: colors.lime }, quiet: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.neutral[200] } });
const avatarToneStyles = StyleSheet.create({ mint: { backgroundColor: colors.mint }, sky: { backgroundColor: colors.sky }, blush: { backgroundColor: colors.blush }, lavender: { backgroundColor: colors.lavender } });
const pillToneStyles = StyleSheet.create({ neutral: { backgroundColor: colors.neutral[100] }, success: { backgroundColor: colors.successSurface }, warning: { backgroundColor: colors.warningSurface }, info: { backgroundColor: colors.infoSurface } });
const pillTextStyles = StyleSheet.create({ neutral: { color: colors.neutral[600] }, success: { color: colors.success }, warning: { color: colors.warning }, info: { color: colors.focus } });
const styles = StyleSheet.create({
  text: { color: colors.ink, includeFontPadding: false },
  card: { borderRadius: radius.card, borderWidth: 1, borderColor: colors.neutral[200], padding: space[4] },
  button: { minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.control, paddingHorizontal: space[4] },
  mobileButton: { minHeight: 44 },
  iconButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.control, borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper },
  mobileIconButton: { width: 44, height: 44 },
  focusRing: { borderWidth: 3, borderColor: colors.focus }, pressed: { opacity: 0.84 }, disabled: { opacity: 0.45 }, buttonText: { fontWeight: '700', lineHeight: 20, textAlignVertical: 'center' }, primaryButtonText: { color: colors.paper }, secondaryButtonText: { color: colors.ink },
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }, pill: { alignSelf: 'flex-start', minHeight: 28, justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: space[2], paddingVertical: 0 },
  // React Native macOS does not vertically centre TextInput text reliably via
  // textAlignVertical. Keep the line box and its insets explicit instead.
  // Multiline callers override these insets with their editor-specific style.
  fieldGroup: { rowGap: space[1] }, field: { minHeight: 44, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.control, backgroundColor: colors.paper, color: colors.ink, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, paddingHorizontal: space[3], paddingTop: 10, paddingBottom: 10 }, fieldError: { borderColor: colors.danger }, hintText: { color: colors.neutral[600] }, errorText: { color: colors.danger }, divider: { height: 1, backgroundColor: colors.neutral[200] },
  platformBadge: { alignSelf: 'flex-start', minHeight: 24, justifyContent: 'center', backgroundColor: colors.neutral[100], borderRadius: radius.pill, paddingHorizontal: space[2], paddingVertical: 0 }, platformBadgeText: { color: colors.neutral[600], lineHeight: 16, textAlignVertical: 'center' },
  messageBubble: { borderRadius: radius.card, paddingHorizontal: space[3], paddingVertical: space[2], maxWidth: '78%' }, messageBubbleMine: { alignSelf: 'flex-end', backgroundColor: colors.mint }, messageBubbleTheirs: { alignSelf: 'flex-start', backgroundColor: colors.neutral[100] },
  conversationRow: { borderRadius: radius.card, padding: space[3], flexDirection: 'row', columnGap: space[3], marginBottom: space[1], minHeight: 72 }, conversationRowSelected: { backgroundColor: colors.sky }, conversationAvatarWrap: { width: 42, height: 42, flexShrink: 0, position: 'relative' }, conversationContent: { flex: 1, minWidth: 0 }, conversationTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', columnGap: space[2] }, conversationName: { fontWeight: '700', flexShrink: 1 }, conversationTimestamp: { color: colors.neutral[600] }, conversationPreview: { color: colors.neutral[600], flex: 1, marginTop: 2 }, unread: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }, unreadText: { color: colors.lime },
});
