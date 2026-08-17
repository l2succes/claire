import React, { useMemo, useState, type ReactNode } from 'react';
import { Text, View, styled, type GetProps } from '@tamagui/core';
import { Image, TextInput, type ImageSourcePropType, type TextInputProps } from 'react-native';
import { compactType, type, type ClaireAvatarTone, type ClaireTextVariant } from '@claire/tokens';

export type { ClaireAvatarTone, ClaireTextVariant };

/**
 * Density is a property of the viewport, not of an ancestor's declaration.
 *
 * The previous implementation selected between two whole type scales through a
 * `surface` context, which meant a component could not be sized independently
 * of what a parent had decided. Variants now carry their own `$compact`
 * overrides, so the same component adapts wherever it is mounted — including
 * the desktop shell, where a narrow inspector pane sits beside a wide thread.
 */
function textVariant(name: ClaireTextVariant) {
  const base = type[name];
  const compact = (compactType as Partial<Record<ClaireTextVariant, object>>)[name];
  return {
    fontFamily: base.fontFamily,
    fontSize: base.fontSize,
    lineHeight: base.lineHeight,
    fontWeight: base.fontWeight,
    ...('letterSpacing' in base ? { letterSpacing: base.letterSpacing } : {}),
    ...(compact ? { $compact: compact } : {}),
  };
}

export const ClaireText = styled(Text, {
  name: 'ClaireText',
  color: '$ink',
  variants: {
    variant: {
      display: textVariant('display'),
      screenTitle: textVariant('screenTitle'),
      sectionTitle: textVariant('sectionTitle'),
      body: textVariant('body'),
      bodySmall: textVariant('bodySmall'),
      label: textVariant('label'),
      monoLabel: textVariant('monoLabel'),
    },
    muted: { true: { color: '$neutral600' } },
    danger: { true: { color: '$danger' } },
  } as const,
  defaultVariants: { variant: 'body' },
});

export type ClaireTextProps = GetProps<typeof ClaireText>;

export const ClaireCard = styled(View, {
  name: 'ClaireCard',
  borderRadius: '$card',
  borderWidth: 1,
  borderColor: '$neutral200',
  padding: '$4',
  variants: {
    tone: {
      paper: { backgroundColor: '$paper' },
      cream: { backgroundColor: '$cream' },
      mint: { backgroundColor: '$mint' },
      sky: { backgroundColor: '$sky' },
    },
  } as const,
  defaultVariants: { tone: 'paper' },
});

/**
 * `focusStyle` and `pressStyle` replace the hand-managed `focused` state the
 * previous implementation tracked through onFocus/onBlur on every control.
 */
const InteractiveFrame = styled(View, {
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '$control',
  cursor: 'pointer',
  focusStyle: { borderWidth: 3, borderColor: '$focus' },
  pressStyle: { opacity: 0.84 },
  variants: {
    disabled: { true: { opacity: 0.45, cursor: 'default', pointerEvents: 'none' } },
  } as const,
});

const ButtonFrame = styled(InteractiveFrame, {
  name: 'ClaireButton',
  // 44pt is the touch minimum; desktop tightens to 36 once there is a mouse.
  minHeight: '$touch',
  $gtCompact: { minHeight: '$control' },
  paddingHorizontal: '$4',
  variants: {
    variant: {
      primary: { backgroundColor: '$ink' },
      secondary: { backgroundColor: '$lime' },
      quiet: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '$neutral200' },
    },
  } as const,
  defaultVariants: { variant: 'primary' },
});

export function ClaireButton({
  children,
  onPress,
  variant = 'primary',
  disabled = false,
  accessibilityLabel,
  testID,
  ...rest
}: Omit<GetProps<typeof ButtonFrame>, 'children'> & {
  children: ReactNode;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'quiet';
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}) {
  return (
    <ButtonFrame
      role="button"
      aria-label={accessibilityLabel}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      testID={testID}
      variant={variant}
      {...rest}
    >
      <ClaireText
        variant="body"
        fontWeight="700"
        lineHeight={20}
        color={variant === 'primary' ? '$paper' : '$ink'}
      >
        {children}
      </ClaireText>
    </ButtonFrame>
  );
}

const IconButtonFrame = styled(InteractiveFrame, {
  name: 'ClaireIconButton',
  width: '$touch',
  height: '$touch',
  $gtCompact: { width: '$control', height: '$control' },
  borderWidth: 1,
  borderColor: '$neutral200',
  backgroundColor: '$paper',
});

export function ClaireIconButton({
  children,
  onPress,
  accessibilityLabel,
  disabled = false,
  testID,
  ...rest
}: Omit<GetProps<typeof IconButtonFrame>, 'children'> & {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <IconButtonFrame
      role="button"
      aria-label={accessibilityLabel}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      testID={testID}
      {...rest}
    >
      {children}
    </IconButtonFrame>
  );
}

export const ClaireDivider = styled(View, {
  name: 'ClaireDivider',
  height: 1,
  backgroundColor: '$neutral200',
  'aria-hidden': true,
});

/**
 * TextInput stays a React Native component rather than a Tamagui `Input`.
 * Callers pass the full React Native TextInput surface (multiline, keyboard
 * type, autoComplete, refs), and re-declaring that through a styled wrapper
 * would narrow it for no benefit.
 */
export function ClaireField({
  label,
  hint,
  error,
  style,
  ...props
}: TextInputProps & { label?: string; hint?: string; error?: string }) {
  return (
    <View rowGap="$1">
      {label ? <ClaireText variant="label">{label}</ClaireText> : null}
      <TextInput
        {...props}
        accessibilityLabel={props.accessibilityLabel || label}
        placeholderTextColor={props.placeholderTextColor || '#9B9B91'}
        style={[
          {
            minHeight: 44,
            borderWidth: 1,
            borderColor: error ? '#C83A3A' : '#DFDCD3',
            borderRadius: 12,
            backgroundColor: '#FFFDF8',
            color: '#10120F',
            fontFamily: type.body.fontFamily,
            fontSize: 14,
            lineHeight: 20,
            paddingHorizontal: 12,
            paddingTop: 10,
            paddingBottom: 10,
          },
          style,
        ]}
      />
      {error ? (
        <ClaireText variant="bodySmall" danger>
          {error}
        </ClaireText>
      ) : hint ? (
        <ClaireText variant="bodySmall" muted>
          {hint}
        </ClaireText>
      ) : null}
    </View>
  );
}

const AvatarFrame = styled(View, {
  name: 'ClaireAvatar',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  flexShrink: 0,
  variants: {
    tone: {
      mint: { backgroundColor: '$mint' },
      sky: { backgroundColor: '$sky' },
      blush: { backgroundColor: '$blush' },
      lavender: { backgroundColor: '$lavender' },
    },
  } as const,
  defaultVariants: { tone: 'mint' },
});

export function ClaireAvatar({
  initials,
  size = 40,
  source,
  tone = 'mint',
}: {
  initials: string;
  size?: number;
  source?: ImageSourcePropType;
  tone?: ClaireAvatarTone;
}) {
  // Broken remote avatar URLs must settle to initials. Leaving a failed Image
  // mounted makes native image loaders retry during parent re-renders.
  const [failed, setFailed] = useState(false);
  const sourceUri =
    typeof source === 'object' && source && !Array.isArray(source) && 'uri' in source
      ? source.uri
      : undefined;
  // Callers naturally create `{ uri }` inline. Keep the source object stable so
  // a harmless parent render does not trigger another image request.
  const stableSource = useMemo<ImageSourcePropType | undefined>(
    () => (sourceUri ? { uri: sourceUri } : source),
    [sourceUri],
  );

  return (
    <AvatarFrame
      aria-label={`${initials} avatar`}
      tone={tone}
      width={size}
      height={size}
      borderRadius={size / 2}
    >
      {stableSource && !failed ? (
        <Image
          source={stableSource as never}
          onError={() => setFailed(true)}
          width={size}
          height={size}
          borderRadius={size / 2}
        />
      ) : (
        <ClaireText variant="label">{initials}</ClaireText>
      )}
    </AvatarFrame>
  );
}

const PillFrame = styled(View, {
  name: 'ClaireStatusPill',
  alignSelf: 'flex-start',
  minHeight: 28,
  justifyContent: 'center',
  borderRadius: '$pill',
  paddingHorizontal: '$2',
  variants: {
    tone: {
      neutral: { backgroundColor: '$neutral100' },
      success: { backgroundColor: '$successSurface' },
      warning: { backgroundColor: '$warningSurface' },
      info: { backgroundColor: '$infoSurface' },
    },
  } as const,
  defaultVariants: { tone: 'neutral' },
});

const PILL_TEXT_COLOR = {
  neutral: '$neutral600',
  success: '$success',
  warning: '$warning',
  info: '$focus',
} as const;

export function ClaireStatusPill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: keyof typeof PILL_TEXT_COLOR;
}) {
  return (
    <PillFrame tone={tone}>
      <ClaireText variant="label" color={PILL_TEXT_COLOR[tone]}>
        {children}
      </ClaireText>
    </PillFrame>
  );
}

export function ClairePlatformBadge({ platform }: { platform: string }) {
  return (
    <View
      aria-label={`${platform} platform`}
      alignSelf="flex-start"
      minHeight={24}
      justifyContent="center"
      backgroundColor="$neutral100"
      borderRadius="$pill"
      paddingHorizontal="$2"
    >
      <ClaireText variant="monoLabel" color="$neutral600" lineHeight={16}>
        {platform}
      </ClaireText>
    </View>
  );
}

export const ClaireMessageBubble = styled(View, {
  name: 'ClaireMessageBubble',
  borderRadius: '$card',
  paddingHorizontal: '$3',
  paddingVertical: '$2',
  maxWidth: '78%',
  variants: {
    fromMe: {
      true: { alignSelf: 'flex-end', backgroundColor: '$mint' },
      false: { alignSelf: 'flex-start', backgroundColor: '$neutral100' },
    },
  } as const,
  defaultVariants: { fromMe: false },
});

const ConversationRowFrame = styled(View, {
  name: 'ClaireConversationRow',
  borderRadius: '$card',
  padding: '$3',
  flexDirection: 'row',
  columnGap: '$3',
  marginBottom: '$1',
  cursor: 'pointer',
  // Comfortable on touch, tighter once there is room for a list beside a thread.
  minHeight: 72,
  $gtExpanded: { minHeight: 64, padding: '$2' },
  focusStyle: { borderWidth: 3, borderColor: '$focus' },
  pressStyle: { opacity: 0.84 },
  hoverStyle: { backgroundColor: '$neutral50' },
  variants: {
    selected: { true: { backgroundColor: '$sky', hoverStyle: { backgroundColor: '$sky' } } },
  } as const,
});

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
  testID,
  ...rest
}: Omit<GetProps<typeof ConversationRowFrame>, 'children'> & {
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
  testID?: string;
}) {
  const label = `${name}, ${platform} conversation${unreadCount ? `, ${unreadCount} unread` : ''}`;

  return (
    <ConversationRowFrame
      role="button"
      aria-label={label}
      aria-selected={selected}
      selected={selected}
      onPress={onPress}
      testID={testID}
      {...rest}
    >
      <View width={42} height={42} flexShrink={0} position="relative">
        <ClaireAvatar initials={initials} source={avatarSource} size={42} tone={avatarTone} />
        {avatarOverlay}
      </View>
      <View flex={1} minWidth={0}>
        <View flexDirection="row" alignItems="center" justifyContent="space-between" columnGap="$2">
          <ClaireText variant="body" numberOfLines={1} fontWeight="700" flexShrink={1}>
            {name}
          </ClaireText>
          {timestamp ? (
            <ClaireText variant="bodySmall" muted>
              {timestamp}
            </ClaireText>
          ) : null}
        </View>
        <View flexDirection="row" alignItems="center" justifyContent="space-between" columnGap="$2">
          <ClaireText variant="bodySmall" numberOfLines={1} muted flex={1} marginTop={2}>
            {preview}
          </ClaireText>
          {unreadCount ? (
            <View
              aria-label={`${unreadCount} unread messages`}
              minWidth={18}
              height={18}
              borderRadius={9}
              backgroundColor="$ink"
              alignItems="center"
              justifyContent="center"
            >
              <ClaireText variant="label" color="$lime">
                {unreadCount}
              </ClaireText>
            </View>
          ) : null}
        </View>
        {!avatarOverlay ? <ClairePlatformBadge platform={platform} /> : null}
      </View>
    </ConversationRowFrame>
  );
}
