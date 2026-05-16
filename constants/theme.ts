// Typography — System font maps to SF Pro (iOS) / Roboto (Android).
// Replace fontBody/fontDisplay with loaded font family names once
// expo-google-fonts (or similar) is wired up in the app entry point.
export const theme = {
  fontBody: 'System',
  fontDisplay: 'System',

  // ── Type scale (sp) ───────────────────────────────────────────────────────
  textXS: 11,    // zone labels, metadata, badge text
  textSM: 13,    // captions, secondary detail
  textMD: 15,    // body, list items, buttons
  textLG: 17,    // modal headers, subheadings
  textXL: 22,    // page headings
  text2XL: 28,   // display (pet name, hero number)

  // ── Font weights ──────────────────────────────────────────────────────────
  weightRegular: '400' as const,
  weightMedium: '500' as const,
  weightSemibold: '600' as const,

  // Keep old names for compatibility with existing code
  fontWeightRegular: '400' as const,
  fontWeightMedium: '500' as const,

  // ── Letter spacing ────────────────────────────────────────────────────────
  trackingTight: -0.3,
  trackingNormal: 0,
  trackingWide: 0.4,
  trackingWidest: 0.8,   // zone labels, section labels

  // ── Colors ───────────────────────────────────────────────────────────────
  // One accent — interactive elements + primary trend line only. Never decorative.
  colorAccent: '#4A90A4',
  colorAccentLight: '#EBF4F7',    // tinted surface behind accent elements

  // Neutrals
  colorNeutralDark: '#1A1A1A',
  colorNeutralMid: '#3D3D3D',
  colorNeutralLight: '#F5F5F3',
  colorSurface: '#FFFFFF',
  colorSurfaceSubtle: '#FAFAF9',  // elevated inner surfaces

  // Text
  colorTextPrimary: '#1A1A1A',
  colorTextSecondary: '#6B6B6B',
  colorTextTertiary: '#A0A09E',

  // Borders
  colorBorder: '#E8E8E6',
  colorBorderStrong: '#D0D0CE',

  // Event semantic colors
  colorEventSymptom: '#C97A6F',
  colorEventSymptomLight: '#FBF0EF',
  colorEventMeal: '#4A90A4',
  colorEventMealLight: '#EBF4F7',
  colorChartEmpty: '#E8E8E6',

  // ── Spacing — 8pt grid ────────────────────────────────────────────────────
  space1: 8,
  space2: 16,
  space3: 24,
  space4: 32,
  space5: 48,
  space6: 64,

  // ── Border radius ─────────────────────────────────────────────────────────
  radiusXS: 4,
  radiusSmall: 8,
  radiusMedium: 16,
  radiusLarge: 24,
  radiusFull: 999,

  // ── Motion ───────────────────────────────────────────────────────────────
  durationFast: 150,
  durationMedium: 250,
  durationSlow: 400,
  easingDefault: 'ease-out',
} as const;

// Shadow tokens — defined outside `as const` so shadowOffset stays mutable,
// which is required by React Native's ViewStyle type.
export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 10,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 8,
  },
};
