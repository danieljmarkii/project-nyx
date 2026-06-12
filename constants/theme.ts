// Typography — v1.2 "Linear Clean". Geist (body) + Newsreader (display).
// Families are loaded + registered in lib/fonts.ts and gated at the app entry
// point (app/_layout.tsx) so no text renders before the faces resolve. Each
// weight is a distinct family because RN does not synthesize weights for custom
// fonts; fontBodyMedium/Semibold map the weight tokens to the loaded faces.
// Only fontDisplay is consumed today (the AI Signal headline) — the app-wide
// body swap to Geist is the follow-up rollout (see backlog).
export const theme = {
  fontBody: 'Geist',
  fontBodyMedium: 'Geist-Medium',
  fontBodySemibold: 'Geist-SemiBold',
  fontDisplay: 'Newsreader',

  // ── Type scale (sp) ───────────────────────────────────────────────────────
  textXS: 11,    // zone labels, metadata, badge text
  textSM: 13,    // captions, secondary detail
  textMD: 15,    // body, list items, buttons
  textLG: 17,    // modal headers, subheadings
  textXL: 22,    // page headings
  text2XL: 28,   // display (pet name, hero number)
  textSignal: 26, // AI Signal headline (display face) — consumed by PR 2
  lineHeightSignal: 34, // AI Signal headline leading (26 × ~1.3, per type-signal preview)

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

  // ── Colors (Design System v1.2 "Linear Clean") ────────────────────────────
  // One accent — interactive elements + primary trend line only. Never decorative.
  colorAccent: '#00C2A8',
  colorAccentLight: '#E0FBF7',    // tinted surface behind accent elements

  // Neutrals
  colorNeutralDark: '#0A0A0A',
  colorNeutralMid: '#262626',
  colorNeutralLight: '#FAFAFA',
  colorSurface: '#FFFFFF',
  colorSurfaceSubtle: '#F5F5F5',  // elevated inner surfaces

  // Text
  colorTextPrimary: '#0A0A0A',
  colorTextSecondary: '#525252',
  colorTextTertiary: '#737373',
  colorTextDisabled: '#A3A3A3',

  // Borders
  colorBorder: '#EAEAEA',
  colorBorderStrong: '#D4D4D4',

  // Event semantic colors
  colorEventSymptom: '#F43F5E',
  colorEventSymptomLight: '#FFE4E6',
  colorEventMeal: '#00C2A8',
  colorEventMealLight: '#E0FBF7',
  colorChartEmpty: '#F0F0F0',

  // Destructive — surface-aware. colorDestructive is tuned for light surfaces;
  // colorDestructiveOnDark is the known-good red for the black photo-viewer
  // backdrop, where #DC2626 reads muddy (see migration plan §3.4).
  colorDestructive: '#DC2626',
  colorDestructiveOnDark: '#ff6b6b',

  // Modal scrim — one value for every bottom-sheet/confirm overlay so stacked
  // surfaces dim identically (switcher sheet, archive confirm; FAB chip next).
  colorScrim: 'rgba(10, 10, 10, 0.35)',

  // Completion "moment" — consumed by PR 4 (gold ring in app/log.tsx).
  colorMomentGlow: '#FBBF24',
  colorMomentConfirm: '#00C2A8',

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
  fab: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
};
