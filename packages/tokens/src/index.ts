/**
 * Claire design tokens — the single source of truth.
 *
 * Two consumers with two rendering models read these:
 *   - the clients, through the Tamagui config in `packages/design-system`
 *   - the marketing site, through the CSS custom properties in `css/tokens.css`
 *
 * `css/tokens.css` is generated from this file by `bun run generate`. Edit the
 * values here, never the CSS.
 */

export const colors = {
  ink: '#10120F',
  cream: '#F4F1EA',
  paper: '#FFFDF8',
  lime: '#DFFF64',
  limeHover: '#D2F04F',
  sky: '#B9DCFF',
  blush: '#F2CFE1',
  lavender: '#D8CCFF',
  mint: '#BDEBD5',
  coral: '#FF745F',
  focus: '#3C68FF',
  focusSoft: '#9FC8F5',
  infoBorder: '#B6D6FA',
  success: '#18794E',
  warning: '#B75D00',
  danger: '#C83A3A',
  successSurface: '#DDF5E5',
  warningSurface: '#FFF0D7',
  infoSurface: '#E3F0FF',
  neutral: {
    50: '#FAF9F6',
    100: '#F0EEE8',
    200: '#DFDCD3',
    300: '#C8C7C0',
    400: '#9B9B91',
    600: '#62635D',
    800: '#2D2F2B',
    950: '#10120F',
  },
} as const;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 } as const;
export const radius = { control: 12, card: 20, panel: 28, pill: 999 } as const;

// These family names intentionally match the bundled font assets in
// apps/client/assets/fonts. Native loads them through the expo-font plugin;
// web declares matching @font-face rules in apps/client/app/+html.tsx.
// Claire’s interface is deliberately one-family at every scale. Public Sans
// carries both body copy and large desktop titles; DM Mono remains reserved
// for compact metadata and overlines.
export const fonts = { sans: 'Public Sans', display: 'Public Sans', mono: 'DM Mono' } as const;

/**
 * Breakpoints. `compact` is a phone, `expanded` is where the desktop shell
 * takes over — one number, referenced by both the Tamagui media config and
 * any layout that needs to branch imperatively.
 */
// Desktop starts at the Electron window minimum.  `wide` and `full` are
// deliberately separate from the phone/tablet density breakpoints: they
// describe when the desktop workspace can reveal its optional panes.
export const breakpoints = { compact: 768, expanded: 900, wide: 1200, full: 1320 } as const;

/**
 * Type scale at desktop density.
 *
 * There is deliberately only one scale. Where compact needs a different size,
 * the design-system component carries a `$gtCompact` override rather than the
 * whole app swapping to a parallel scale.
 */
export const type = {
  display: { fontFamily: fonts.display, fontSize: 46, lineHeight: 48, fontWeight: '700' as const, letterSpacing: -1.6 },
  screenTitle: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, fontWeight: '700' as const, letterSpacing: -0.8 },
  sectionTitle: { fontFamily: fonts.sans, fontSize: 20, lineHeight: 25, fontWeight: '700' as const, letterSpacing: -0.3 },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  bodySmall: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  label: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, fontWeight: '600' as const },
  monoLabel: { fontFamily: fonts.mono, fontSize: 10, lineHeight: 14, fontWeight: '600' as const, letterSpacing: 0.7 },
} as const;

/**
 * Compact overrides. Only the variants that actually differ appear here; the
 * rest inherit from `type`. This replaces the former parallel `mobileType`
 * scale, which forced every variant to be restated whether it changed or not.
 */
export const compactType = {
  display: { fontSize: 42, lineHeight: 44, letterSpacing: -1.4 },
  screenTitle: { fontSize: 31, lineHeight: 34 },
  sectionTitle: { lineHeight: 24, letterSpacing: -0.25 },
  label: { fontSize: 11, lineHeight: 15 },
} as const;

export type ClaireTextVariant = keyof typeof type;
export type ClaireAvatarTone = 'mint' | 'sky' | 'blush' | 'lavender';
