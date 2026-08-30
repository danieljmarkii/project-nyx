// CUL-578 — the accent-on-light AA guard.
//
// The theme mints an "ink" for every tint it also mints (colorAccentInk on
// colorAccentLight, colorEventSymptomInk on colorEventSymptomLight, and the two
// later siblings), because the bright category colours are GLYPH tints — tuned for
// the 3:1 non-text target — and fall well short of AA when they carry small TEXT.
// The theme file says so in prose at :51-58 and :237-242; prose is not a check, and
// the same defect has now been found three times by audit (CUL-27 on TodayZone's door,
// CUL-578 on TrendZone's and the Badge tint pairs, CUL-744 on the residual 76).
//
// So this file pins BOTH halves of the reason the ink tokens exist:
//   • every ink clears WCAG AA for normal text (4.5:1) on the ground it is for, and
//   • the bright colour it replaced does NOT.
// The second half is the one that earns its place: without it, "simplifying" an ink
// back to the brand accent is a green one-token edit. With it, that edit red-lights
// and has to argue with the ratio.
//
// Consumption is asserted where it renders (Badge.test.tsx, TrendZone.test.tsx,
// FilterChip.test.tsx and ScopeMenu.test.tsx read the flattened style off the tree),
// and the CLASS is held by guards/accentOnLight.test.ts, which fails the build on an
// accent-coloured text node that has not had its ground decided either way. This file
// is deliberately only about the tokens — it is one end of that chain, not a
// restatement of the others.

import { theme } from './theme';

/** WCAG 2.1 relative luminance of an #rrggbb colour (sRGB, linearized). */
function relativeLuminance(hex: string): number {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio between two opaque #rrggbb colours. Order-independent. */
export function contrastRatio(fg: string, bg: string): number {
  const [lighter, darker] = [relativeLuminance(fg), relativeLuminance(bg)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG AA, normal-size text. Every ink below carries small text (9–15px), never large. */
const AA_NORMAL_TEXT = 4.5;

describe('contrastRatio — the measure itself', () => {
  // Anchored on the two ends WCAG defines exactly, so a mistake in the linearization
  // cannot make every assertion below quietly generous.
  it('is 21:1 for black on white and 1:1 for a colour on itself', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#00C2A8', '#00C2A8')).toBeCloseTo(1, 5);
  });
});

describe('text inks clear AA on the grounds they are for', () => {
  const pairs: ReadonlyArray<[label: string, ink: string, ground: string]> = [
    // The two CUL-578 repoints.
    ['accent ink on its own tint (Badge accent)', theme.colorAccentInk, theme.colorAccentLight],
    ['accent ink on the white Card (TrendZone door + sublabels)', theme.colorAccentInk, theme.colorSurface],
    ['symptom ink on its own tint (Badge symptom)', theme.colorEventSymptomInk, theme.colorEventSymptomLight],
    // The rest of the ink family, pinned while the rule is being written down: same
    // class, same reason, and each one's ratio is already asserted in a theme comment.
    ['accent ink on the neutral-light ground', theme.colorAccentInk, theme.colorNeutralLight],
    ['symptom ink on white', theme.colorEventSymptomInk, theme.colorSurface],
    ['medication ink on its own tint', theme.colorEventMedicationInk, theme.colorEventMedicationLight],
    ['attention ink on its wash', theme.colorAttentionInk, theme.colorAttentionLight],
  ];

  it.each(pairs)('%s', (_label, ink, ground) => {
    expect(contrastRatio(ink, ground)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});

describe('the bright category colours do NOT clear AA as text on light', () => {
  // This is why the inks exist. Each of these was shipped as small text at some point
  // and found by an audit; the ratios are the ones CUL-27 and CUL-578 measured.
  const failing: ReadonlyArray<[label: string, colour: string, ground: string]> = [
    ['brand teal on its own tint', theme.colorAccent, theme.colorAccentLight],
    ['brand teal on the white Card', theme.colorAccent, theme.colorSurface],
    ['symptom rose on its own tint', theme.colorEventSymptom, theme.colorEventSymptomLight],
  ];

  it.each(failing)('%s — so it is never the colour of a text label there', (_label, colour, ground) => {
    expect(contrastRatio(colour, ground)).toBeLessThan(AA_NORMAL_TEXT);
  });

  // The measured values, recorded so a token edit that changes them is a visible diff
  // rather than a silent shift inside the pass/fail band above.
  it('records the measured ratios the audits cited', () => {
    expect(contrastRatio(theme.colorAccent, theme.colorSurface)).toBeCloseTo(2.26, 2);
    expect(contrastRatio(theme.colorAccentInk, theme.colorSurface)).toBeCloseTo(5.17, 2);
    expect(contrastRatio(theme.colorAccentInk, theme.colorAccentLight)).toBeCloseTo(4.75, 2);
    expect(contrastRatio(theme.colorEventSymptomInk, theme.colorEventSymptomLight)).toBeCloseTo(6.68, 2);
  });
});

describe('and on a DARK ground the pairing INVERTS — which is why the sweep was a walk', () => {
  // CUL-744 repointed 76 of the 81 accent-as-text sites to the ink and deliberately left
  // five alone. This block is why those five are correct rather than missed.
  //
  // The ink is not "the safer teal". It is the teal for a LIGHT ground, and on a dark one
  // it is the failing half of the pair — so a mechanical repoint of all 81 sites would
  // have shipped a WORSE defect than the one being fixed, on the night surfaces, under a
  // green diff and a green test run. Pinning the inversion here is what stops a later
  // "simplify to one accent token" pass from looking free.
  const darkGrounds: ReadonlyArray<[label: string, ground: string]> = [
    ['the snackbar / dark-button ground', theme.colorNeutralDark],
    ['the brand night ground (Landing, Day Summary)', theme.colorBrandNight],
    ['the elevated brand night (the recap offer card)', theme.colorBrandNightElevated],
  ];

  it.each(darkGrounds)('%s — the bright accent CLEARS AA there', (_label, ground) => {
    expect(contrastRatio(theme.colorAccent, ground)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it.each(darkGrounds)('%s — and the ink DOES NOT', (_label, ground) => {
    expect(contrastRatio(theme.colorAccentInk, ground)).toBeLessThan(AA_NORMAL_TEXT);
  });

  it('records the measured ratios behind the five keeps', () => {
    expect(contrastRatio(theme.colorAccent, theme.colorNeutralDark)).toBeCloseTo(8.75, 2);
    expect(contrastRatio(theme.colorAccent, theme.colorBrandNight)).toBeCloseTo(8.09, 2);
    expect(contrastRatio(theme.colorAccent, theme.colorBrandNightElevated)).toBeCloseTo(6.57, 2);
    // The counterfactual, so the cost of a blind sweep is a number and not an adjective.
    expect(contrastRatio(theme.colorAccentInk, theme.colorNeutralDark)).toBeCloseTo(3.83, 2);
    expect(contrastRatio(theme.colorAccentInk, theme.colorBrandNightElevated)).toBeCloseTo(2.88, 2);
  });
});
