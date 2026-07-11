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
  textXL: 22,    // page headings (in-screen section headers)
  textPageTitle: 24, // tab page titles (History, Foods) — sits between textXL/text2XL
  text2XL: 28,   // display (pet name, hero number)
  textSignal: 26, // AI Signal headline (display face) — consumed by PR 2
  lineHeightSignal: 34, // AI Signal headline leading (26 × ~1.3, per type-signal preview)
  lineHeightBody: 22, // body/paragraph leading — app-wide default for multi-line copy
  lineHeightSM: 18, // caption/compact-row leading (textSM × ~1.35) — e.g. the cross-pet banner

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
  colorAccentSoft: '#86D9CC',     // mid teal — a calm, on-brand fill that is NOT a verdict
                                  // (e.g. the treats segment of the Meals & treats card)
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
  colorTextOnDark: '#FFFFFF',                 // text/icons on a dark button or photo scrim
  colorTextOnDarkMuted: 'rgba(255,255,255,0.92)', // secondary text on a dark scrim
  colorTextOnDarkSecondary: '#B4B8B4',        // dimmer body/label text on a solid dark surface
  colorScrimDark: 'rgba(0,0,0,0.55)',         // gradient/overlay scrim over a photo hero

  // Dark premium/marketing surfaces. The onboarding paywall (B-251 PR 10) is the
  // first full solid dark screen (a premium feel leans dark). These are solid
  // surface fills — distinct from colorScrimDark, which is a translucent overlay
  // over a photo. colorTextOnDark (#FFF) + colorTextOnDarkSecondary + colorAccent
  // cover the type and accent marks on top of them.
  colorSurfaceDark: '#101312',                // the dark canvas of a premium surface
  colorSurfaceDarkElevated: '#16201E',        // an elevated tile/card on the dark canvas
  colorBorderOnDark: '#33383A',               // hairline border/divider on a dark surface

  // Brand "night" — the Culprit world/ground colour (B-275 palette half; Moon &
  // Signal icon field). This is a WORLD colour, not an accent: it is only ever a
  // ground/backdrop (icon field, marketing heroes, dark brand surfaces) — never a
  // tappable/interactive fill. Teal (colorAccent #00C2A8) stays the SOLE
  // interactive accent (buttons, trend line, live state), so the "one accent,
  // never decorative" rule above survives. Additive only — no component adopts
  // these yet.
  //
  // Two dark tokens, two distinct roles (the colorSurfaceDark reconciliation —
  // resolved: KEEP BOTH): colorBrandNight is the indigo *brand* night (Culprit's
  // identity ground); colorSurfaceDark #101312 stays the *neutral* near-black
  // photo/premium canvas (paywall, photo viewer). Not repointed — a repoint would
  // need on-device dark-surface QA and buys nothing here (indigo is additive).
  colorBrandNight: '#13112E',                 // midnight-indigo brand/night ground
  colorBrandNightElevated: '#251F57',         // cards/depth on the brand night

  // ── Night-surface tokens (Culprit in-app brand alignment — B-284 PR N1) ────
  // Additive only. These paint text/safety/hairline/gradient/starfield onto the
  // night grounds (colorBrandNight / colorBrandNightElevated) that appear where
  // the app is *working on the pet's behalf* (Landing, loading, the night moment,
  // the Signal card's night variant — spec §1.2 the register rule). No component
  // repoints in this PR — capture & records stay the shipped light system.
  //
  // THE ACCENT RULE (spec §1.3, unchanged): teal `colorAccent #00C2A8` remains the
  // SOLE tappable/live/interactive accent on every ground. Every token below is a
  // world/ground colour — text, safety rail, hairline, gradient stop, or starfield
  // — never an interactive fill, so the design-system "one accent, never decorative"
  // rule holds by construction. Red keeps its shipped meanings (symptom /
  // destructive); colorEventSymptomOnNight is the night-ground sibling of the
  // shipped colorDestructiveOnDark, never decorative.
  //
  // CONTRAST RECEIPTS — WCAG relative-luminance ratios of each text token on the
  // primary ground colorBrandNight #13112E (verified, not asserted):
  //   colorMoonlight            15.80:1  (AAA)
  //   colorTextOnNight          15.40:1  (AAA)
  //   colorTextOnNightMuted      7.57:1  (AAA)
  //   colorEventSymptomOnNight   6.80:1  (AA / AAA-large)
  //   colorTextOnNightFaint      3.79:1  (AA-large ONLY — hence large/secondary use)
  colorEventSymptomOnNight: '#FB7185',        // safety rail/tag on night grounds (6.8:1)
  colorTextOnNight: '#ECEAF6',                // primary text on night grounds (15.4:1)
  colorTextOnNightMuted: '#A6A2CE',           // secondary text on night grounds (7.6:1)
  colorTextOnNightFaint: '#706BA6',           // metadata/sample lines — large/secondary only (3.8:1)
  colorMoonlight: '#F2EEE4',                  // crescent fill + display headlines on night (15.8:1)
  colorBorderOnNight: 'rgba(196,190,255,0.16)', // hairlines/dividers on night grounds
  colorAuroraViolet: '#221C56',               // hero radial glow stop 1
  colorAuroraIndigo: '#191449',               // hero radial glow stop 2
  colorAuroraTeal: 'rgba(0,194,168,0.10)',    // restrained teal radial near the Signal dot
  colorStar: 'rgba(255,255,255,0.45)',        // starfield dot base (per-dot opacity varies 0.28–0.55)

  // CulpritMark (B-284 PR N2, §3) — the crescent's LIGHT-ground fill. Additive:
  // the N1 block above covers night-ground tokens only; this is the one light-side
  // companion the mark needs. Deep indigo, not colorTextPrimary, so the glyph
  // reads as the same brand mark on both grounds rather than inheriting whatever
  // the surrounding text colour happens to be.
  colorCulpritCrescentOnLight: '#211E4E',

  // WhorlSpinner (B-284 PR N3, §5) — the day-ground ridge lavender. The spinner's
  // DAY palette is "teal + indigo-lavender": teal (colorAccent) alternates with this
  // soft lavender on light content surfaces. Same value as colorTextOnNightMuted (a
  // WORLD lavender), named separately for its role. Never interactive, so the
  // one-accent rule (§1.3) holds — teal stays the sole tappable/live accent; the
  // night-ground palette reuses colorAccent + colorMoonlight and needs no token.
  colorWhorlRidgeDay: '#A6A2CE',

  // Borders
  colorBorder: '#EAEAEA',
  colorBorderStrong: '#D4D4D4',

  // Event semantic colors
  colorEventSymptom: '#F43F5E',
  colorEventSymptomLight: '#FFE4E6',
  // Calm safety-surface border — a mid-tone between symptom and symptom-light, for
  // a tinted safety container that needs definition without alarm (the cross-pet
  // safety banner, multi-pet §4 / mock A3). Softer than colorEventSymptom so the
  // banner reads "worth a look", never "alarm".
  colorEventSymptomBorder: '#FBCFD6',
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
  // Sub-grid micro-gap (2pt): the typographic space between a label and the
  // sub-label that hugs it (section title → hint line). Deliberately below the
  // 8pt layout grid — it's type leading, not layout rhythm.
  spaceMicro: 2,
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
