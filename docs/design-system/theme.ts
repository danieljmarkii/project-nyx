// ──────────────────────────────────────────────────────────────────────────
// constants/theme.ts — Project Nyx v1.2 (Linear Clean)
//
// Drop-in replacement for the existing constants/theme.ts in
// danieljmarkii/project-nyx. Same shape as v1.1; only token VALUES change.
//
// Generated from the canonical design system at
// _system/colors_and_type.css. See _system/README.md "Color philosophy"
// for usage rules — the principles (one accent, one neutral family, two
// event semantics, earned moments) are unchanged from v1.1; only the
// hex values shift.
// ──────────────────────────────────────────────────────────────────────────

export const colors = {
  // Accent — vivid mint. Interactive elements + primary trend line ONLY.
  // Never decorative. Never used to fill space.
  accent: '#00C2A8',
  accentLight: '#E0FBF7',

  // Neutrals — cool clean-room family. True greys, no warm tint.
  neutralDark: '#0A0A0A',       // near-black ink
  neutralMid: '#262626',        // secondary surface (FAB, primary btn fill)
  neutralLight: '#FAFAFA',      // app bg
  surface: '#FFFFFF',           // card surface (pure white)
  surfaceSubtle: '#F5F5F5',     // elevated inner surface, tile bg

  // Text
  textPrimary: '#0A0A0A',
  textSecondary: '#525252',
  textTertiary: '#737373',
  textDisabled: '#A3A3A3',

  // Borders
  border: '#EAEAEA',
  borderStrong: '#D4D4D4',

  // Event semantics — symptom (hot rose) vs meal (accent mint).
  // The ONLY non-neutral, non-accent colors in the palette.
  eventSymptom: '#F43F5E',
  eventSymptomLight: '#FFE4E6',
  eventMeal: '#00C2A8',
  eventMealLight: '#E0FBF7',
  chartEmpty: '#F0F0F0',

  // Moments — earned color. Used ONLY in completion / milestone moments,
  // for <2s at a time, only as a reward for a real user action.
  // The single warm element retained in v1.2.
  momentGlow: '#FBBF24',         // warm gold — completion-ring radial glow
  momentConfirm: '#00C2A8',      // the check itself (same mint as accent)

  // Destructive — label-only, never a fill.
  destructive: '#DC2626',
} as const;

// Brand colors per food brand. Used as a small accent on food tiles ONLY.
// Not invented — these are the brands' actual identity colors at modest size.
export const brandColors = {
  'Fancy Feast':     '#C0463A',
  'Open Farm':       '#1F5945',
  'Stella & Chewy':  '#2C6FA6',
  'Weruva':          '#E8A33C',
  'Royal Canin':     '#8B1F2E',
  "Hill's":          '#1C4E7A',
  _default:          '#525252',
} as const;
export function brandColor(brand: string): string {
  return (brandColors as Record<string, string>)[brand] ?? brandColors._default;
}

// ── Fonts ──────────────────────────────────────────────────────────────
// The codebase ships System (SF/Roboto) as the canonical body+display
// stack. The design system substitutes Geist (body) + Newsreader (display)
// for web; the native app stays on System.
export const fonts = {
  body: 'System',
  display: 'System',
} as const;

// ── Type scale (px → sp in RN maps 1:1) ────────────────────────────────
export const text = {
  xs: 11,     // zone labels, metadata, badge text
  sm: 13,     // captions, secondary detail
  md: 15,     // body, list items, buttons
  lg: 17,     // modal headers, subheadings
  xl: 22,     // page headings
  xxl: 28,    // display (pet name, hero number)
  signal: 26, // AI Signal headline on home (display face)
} as const;

export const weights = {
  regular: '400',
  medium: '500',
  semibold: '600', // rare emphasis only
} as const;

export const tracking = {
  tight: -0.3,
  normal: 0,
  wide: 0.4,
  widest: 0.8,    // zone labels (SIGNAL · TODAY · TREND)
} as const;

// ── Spacing — strict 8pt grid ──────────────────────────────────────────
export const space = {
  s1: 8,
  s2: 16,
  s3: 24,
  s4: 32,
  s5: 48,
  s6: 64,
} as const;

// ── Radius ─────────────────────────────────────────────────────────────
export const radius = {
  xs: 4,
  sm: 8,    // inputs
  md: 16,   // cards, buttons
  lg: 24,   // sheets
  full: 999, // pills, chips, avatars
} as const;

// ── Motion ─────────────────────────────────────────────────────────────
export const duration = {
  fast: 150,
  medium: 250,
  slow: 400,
} as const;

export const easing = {
  // Calm ease-out; the only easing curve in the product.
  default: [0.2, 0.7, 0.2, 1] as const,
};

// ── Shadows — three steps, all soft, all neutral ───────────────────────
// (RN style objects — convert to elevation on Android as needed.)
export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 10,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 6,
  },
  // FAB sits on a content layer (not over a background), so it gets a
  // tighter custom shadow.
  fab: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
} as const;

// ── Convenience: default export bundling everything ────────────────────
export const theme = {
  colors,
  brandColors,
  fonts,
  text,
  weights,
  tracking,
  space,
  radius,
  duration,
  easing,
  shadow,
} as const;

export type Theme = typeof theme;
export default theme;
