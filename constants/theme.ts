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

  // ── Colors — palette "A · Linear Clean" ───────────────────────────────────
  // Restrained greyscale + one confident accent, in the Linear/Vercel/Cal.com
  // register. The accent is for interactive elements + meal events only — never
  // decorative. Symptom and danger are deliberately SEPARATE semantic tokens:
  // symptom data uses a calm terracotta (never an alarm-red an owner would
  // over-read), danger is reserved for destructive actions. See
  // design-principles.md § Color.
  colorAccent: '#5E6AD2',         // Linear indigo — interactive elements, meal events
  colorAccentLight: '#EEEFFB',    // tinted surface behind accent elements

  // Neutrals — cool, tight off-white
  colorNeutralDark: '#16161A',    // near-black — FAB, primary buttons, display text
  colorNeutralMid: '#3A3A42',
  colorNeutralLight: '#F6F6F7',   // app page background
  colorSurface: '#FFFFFF',        // cards / modals
  colorSurfaceSubtle: '#FAFAFB',  // elevated inner surfaces

  // Text
  colorTextPrimary: '#16161A',
  colorTextSecondary: '#6A6A73',
  colorTextTertiary: '#9B9BA3',

  // Borders
  colorBorder: '#EAEAEC',
  colorBorderStrong: '#D3D3D8',

  // Event semantic colors
  colorEventSymptom: '#C97A6F',   // calm terracotta — symptom data + trend bars
  colorEventSymptomLight: '#FBF0EF',
  colorEventMeal: '#5E6AD2',      // meals share the accent
  colorEventMealLight: '#EEEFFB',
  colorChartEmpty: '#EAEAEC',

  // Danger — destructive actions only (delete / wipe). Never decorative.
  colorDanger: '#C0392B',         // on light surfaces
  colorDangerOnDark: '#FF6B6B',   // brighter — destructive text on dark backdrops (photo viewer)

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
