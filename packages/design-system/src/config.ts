import { createFont, createTamagui, createTokens } from '@tamagui/core';
import { breakpoints, colors, fonts, radius, space, type } from '@claire/tokens';

/**
 * Tamagui configuration for every Claire client.
 *
 * The values come from `@claire/tokens`; nothing is redefined here. What this
 * file adds is the media configuration, which is the mechanism that replaced
 * the old parallel `mobileType` scale and `surface` context: components carry
 * `$gtCompact` / `$gtExpanded` overrides instead of the whole tree switching
 * to a second set of tokens.
 */

/** Tamagui token names must be `$`-prefixed at use sites but bare in the map. */
const colorTokens = {
  ink: colors.ink,
  cream: colors.cream,
  paper: colors.paper,
  lime: colors.lime,
  limeHover: colors.limeHover,
  sky: colors.sky,
  blush: colors.blush,
  lavender: colors.lavender,
  mint: colors.mint,
  coral: colors.coral,
  focus: colors.focus,
  focusSoft: colors.focusSoft,
  infoBorder: colors.infoBorder,
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
  successSurface: colors.successSurface,
  warningSurface: colors.warningSurface,
  infoSurface: colors.infoSurface,
  neutral50: colors.neutral[50],
  neutral100: colors.neutral[100],
  neutral200: colors.neutral[200],
  neutral300: colors.neutral[300],
  neutral400: colors.neutral[400],
  neutral600: colors.neutral[600],
  neutral800: colors.neutral[800],
  neutral950: colors.neutral[950],
  transparent: 'transparent',
} as const;

export const tokens = createTokens({
  color: colorTokens,
  space: {
    ...space,
    true: space[4],
    0: 0,
  },
  size: {
    ...space,
    true: space[4],
    0: 0,
    // Control heights. `control` is the desktop hit target; `touch` is the 44pt
    // minimum the mobile surfaces need.
    control: 36,
    touch: 44,
    avatar: 42,
  },
  radius: {
    ...radius,
    true: radius.control,
    0: 0,
  },
  zIndex: { 0: 0, 1: 100, 2: 200, 3: 300, 4: 400 },
});

function claireFont(family: string) {
  return createFont({
    family,
    size: {
      1: type.monoLabel.fontSize,
      2: type.label.fontSize,
      3: type.bodySmall.fontSize,
      4: type.body.fontSize,
      5: type.sectionTitle.fontSize,
      6: type.screenTitle.fontSize,
      7: type.display.fontSize,
      true: type.body.fontSize,
    },
    lineHeight: {
      1: type.monoLabel.lineHeight,
      2: type.label.lineHeight,
      3: type.bodySmall.lineHeight,
      4: type.body.lineHeight,
      5: type.sectionTitle.lineHeight,
      6: type.screenTitle.lineHeight,
      7: type.display.lineHeight,
      true: type.body.lineHeight,
    },
    weight: { 4: '400', 6: '600', 7: '700', true: '400' },
    letterSpacing: { 4: 0, true: 0 },
  });
}

/**
 * Breakpoints.
 *
 * `compact` is a phone or a narrow window. `gtExpanded` is where the desktop
 * shell takes over — the same 900 threshold the shell uses, read from
 * `@claire/tokens` so the two cannot disagree.
 */
export const media = {
  compact: { maxWidth: breakpoints.compact - 1 },
  gtCompact: { minWidth: breakpoints.compact },
  medium: { maxWidth: breakpoints.expanded - 1 },
  gtExpanded: { minWidth: breakpoints.expanded },
  gtWide: { minWidth: breakpoints.wide },
  gtFull: { minWidth: breakpoints.full },
  // Pointer-precision, not size: hover affordances should not appear on touch.
  pointerFine: { pointer: 'fine' },
} as const;

export const claireConfig = createTamagui({
  tokens,
  fonts: {
    body: claireFont(fonts.sans),
    heading: claireFont(fonts.display),
    mono: claireFont(fonts.mono),
  },
  themes: {
    light: {
      background: tokens.color.cream,
      backgroundStrong: tokens.color.paper,
      color: tokens.color.ink,
      colorMuted: tokens.color.neutral600,
      borderColor: tokens.color.neutral200,
      accent: tokens.color.lime,
      focus: tokens.color.focus,
    },
  },
  media,
  defaultFont: 'body',
  settings: {
    // Claire's surfaces are deliberately light-only today. Declaring it keeps
    // Tamagui from inserting a dark theme that nothing styles for.
    fastSchemeChange: true,
  },
});

export type ClaireConfig = typeof claireConfig;

declare module '@tamagui/core' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface TamaguiCustomConfig extends ClaireConfig {}
}
