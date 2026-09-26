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
    // CUL-871 — the chosen look chip. Its ground is the DEEPER wash, which is the
    // whole reason this ink exists (see the failing half below).
    ['selected accent ink on the deep wash (a chosen look chip)', theme.colorAccentInkSelected, theme.colorAccentWashDeep],
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
    // CUL-871 — and the pair one step further in. The ORDINARY accent ink, which is
    // correct on colorAccentLight, is the failing half on the deeper wash a chosen
    // look chip stands on. This row is what makes the selected ink un-simplifiable.
    ['accent ink on the DEEP wash', theme.colorAccentInk, theme.colorAccentWashDeep],
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
    // CUL-871 / R16, the round-4 product read's two measurements, recorded so the
    // 20%-louder chip cannot drift back under the floor unnoticed.
    expect(contrastRatio(theme.colorAccentInk, theme.colorAccentWashDeep)).toBeCloseTo(4.40, 2);
    expect(contrastRatio(theme.colorAccentInkSelected, theme.colorAccentWashDeep)).toBeCloseTo(5.69, 2);
  });
});

describe('the FAB pair — an indigo disc and its teal plus (CUL-322, D3 = C)', () => {
  // A NON-TEXT target (WCAG 1.4.11): the disc must clear 3:1 against the ground it
  // floats over, and the plus 3:1 against the disc. Three grounds, because the FAB
  // floats over Home's colorNeutralLight container, the white Cards scrolling under
  // it, and — while its menu is open — the indigo scrim laid over both.
  //
  // CUL-1063 shipped the disc as colorAccentInk, the one teal that cleared 3:1 with
  // a white plus, and the PM read it on device as drab. D3 = C inverts the pair: the
  // brand night is the disc and the BRIGHT teal is the glyph, the one place it passes
  // (in-app brand spec §1 rule 3 names the FAB as its one exception).
  const NON_TEXT = 3;

  const passing: ReadonlyArray<[label: string, fg: string, bg: string]> = [
    ['the disc on the app ground', theme.colorBrandNightElevated, theme.colorNeutralLight],
    ['the disc over a white Card', theme.colorBrandNightElevated, theme.colorSurface],
    ['the disc over its own open scrim', theme.colorBrandNightElevated, over(theme.colorScrimNight, theme.colorNeutralLight)],
    ['the teal plus on the disc', theme.colorAccent, theme.colorBrandNightElevated],
  ];

  it.each(passing)('%s clears 3:1', (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(NON_TEXT);
  });

  // The failing halves, each the pair a later "tidy" would reach for. A white plus
  // on the bright teal is why CUL-1063 could not draw the round-4 frame; the bright
  // teal as the disc fails both grounds. Without these rows either edit is green.
  const failing: ReadonlyArray<[label: string, fg: string, bg: string]> = [
    ['the bright accent as the disc, on the app ground', theme.colorAccent, theme.colorNeutralLight],
    ['the bright accent as the disc, over a white Card', theme.colorAccent, theme.colorSurface],
    ['a white plus on the bright accent', theme.colorTextOnDark, theme.colorAccent],
  ];

  it.each(failing)('%s does NOT — so it is never the FAB', (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeLessThan(NON_TEXT);
  });

  it('records the measured ratios the PR body and the brand spec cite', () => {
    expect(contrastRatio(theme.colorBrandNightElevated, theme.colorNeutralLight)).toBeCloseTo(14.25, 2);
    expect(contrastRatio(theme.colorBrandNightElevated, theme.colorSurface)).toBeCloseTo(14.87, 2);
    expect(contrastRatio(theme.colorAccent, theme.colorBrandNightElevated)).toBeCloseTo(6.57, 2);
    expect(contrastRatio(theme.colorAccent, theme.colorNeutralLight)).toBeCloseTo(2.17, 2);
  });
});

/** An `rgba(r, g, b, a)` token laid over an opaque ground, as the eye sees it: the one
 *  honest way to measure a translucent mark (WCAG measures the rendered colours). */
function over(rgba: string, ground: string): string {
  const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(rgba);
  if (!m) throw new Error(`not an rgba token: ${rgba}`);
  const alpha = Number(m[4]);
  const g = ground.replace('#', '');
  const bg = [0, 2, 4].map((i) => parseInt(g.slice(i, i + 2), 16));
  const mixed = [m[1], m[2], m[3]].map((v, i) => Math.round(Number(v) * alpha + bg[i] * (1 - alpha)));
  return `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

describe('the day mark’s line — a NON-TEXT mark, told apart by shape (CUL-1165)', () => {
  // History v2 spec §3.4 / §5.7, AC 26. The line under a logged day, whole or broken
  // (a meal left unfinished; under a medication filter, a dose not given in full), is a
  // graphical object, so its floor is WCAG 1.4.11's 3:1 against the box it sits in, not
  // the 4.5:1 text floor. The broken line is the SAME colour, dashed: the difference is
  // shape, so it only reads if the colour itself is visible. Two boxes carry a line: the
  // white one of a logged day, and the rose one of a vomit day, where the line draws white
  // and still breaks, so an unfinished meal on a vomit day is not painted over.
  const NON_TEXT = 3;

  const passing: ReadonlyArray<[label: string, line: string, box: string]> = [
    ['the logged line on a logged day’s white box', theme.colorAccentGlyph, theme.colorSurface],
    ['the line on a vomit day’s rose box (solid white)', theme.colorTextOnDark, theme.colorEventSymptom],
  ];

  it.each(passing)('%s clears 3:1', (_label, line, box) => {
    expect(contrastRatio(line, box)).toBeGreaterThanOrEqual(NON_TEXT);
  });

  // The failing half: the three colours this change retired. Each one drew a line an
  // owner could not see, and the paler "left some" line was the only thing telling an
  // unfinished meal apart, so a later "soften the line back" is a red build here rather
  // than a tidy-looking diff.
  const failing: ReadonlyArray<[label: string, line: string, box: string]> = [
    ['the retired logged line (colorAccentSoft) on white', theme.colorAccentSoft, theme.colorSurface],
    ['the retired left-some line (colorAccentWashDeep) on white', theme.colorAccentWashDeep, theme.colorSurface],
    ['the retired on-rose line (55% white) on the rose', over(theme.colorTextOnDarkFaint, theme.colorEventSymptom), theme.colorEventSymptom],
    // And the brand teal itself, so "just use colorAccent" is not the tempting repair.
    ['the brand teal on white', theme.colorAccent, theme.colorSurface],
  ];

  it.each(failing)('%s does NOT, so it is never the line', (_label, line, box) => {
    expect(contrastRatio(line, box)).toBeLessThan(NON_TEXT);
  });

  it('records the measured ratios', () => {
    expect(contrastRatio(theme.colorAccentGlyph, theme.colorSurface)).toBeCloseTo(3.27, 2);
    expect(contrastRatio(theme.colorTextOnDark, theme.colorEventSymptom)).toBeCloseTo(3.67, 2);
    expect(contrastRatio(theme.colorAccentSoft, theme.colorSurface)).toBeCloseTo(1.64, 2);
    expect(contrastRatio(theme.colorAccentWashDeep, theme.colorSurface)).toBeCloseTo(1.18, 2);
    expect(contrastRatio(over(theme.colorTextOnDarkFaint, theme.colorEventSymptom), theme.colorEventSymptom)).toBeCloseTo(2.0, 2);
  });

  it('the glyph is not a text colour: it fails AA on white, where text takes the ink', () => {
    expect(contrastRatio(theme.colorAccentGlyph, theme.colorSurface)).toBeLessThan(AA_NORMAL_TEXT);
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
