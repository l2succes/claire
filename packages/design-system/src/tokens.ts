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
export const type = {
  display: { fontSize: 52, lineHeight: 54, fontWeight: '700' as const },
  screenTitle: { fontSize: 28, lineHeight: 32, fontWeight: '700' as const },
  sectionTitle: { fontSize: 18, lineHeight: 23, fontWeight: '700' as const },
  body: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  bodySmall: { fontSize: 12, lineHeight: 17, fontWeight: '400' as const },
  label: { fontSize: 11, lineHeight: 15, fontWeight: '600' as const },
  monoLabel: { fontSize: 10, lineHeight: 14, fontWeight: '600' as const, fontFamily: 'Menlo', letterSpacing: 0.4 },
} as const;
export type ClaireTextVariant = keyof typeof type;

export const mobileType = {
  display: { fontSize: 42, lineHeight: 44, fontWeight: '700' as const, letterSpacing: -1.4 },
  screenTitle: { fontSize: 31, lineHeight: 34, fontWeight: '700' as const, letterSpacing: -0.8 },
  sectionTitle: { fontSize: 20, lineHeight: 24, fontWeight: '700' as const, letterSpacing: -0.25 },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  bodySmall: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  label: { fontSize: 11, lineHeight: 15, fontWeight: '600' as const },
  monoLabel: { fontSize: 10, lineHeight: 14, fontWeight: '600' as const, fontFamily: 'monospace', letterSpacing: 0.7 },
} as const;
