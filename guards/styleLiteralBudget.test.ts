// Hand typed style values under app/ and components/ only ever go DOWN.
//
// CUL-2138 (PR-03a of CUL-1897) · the design system usage audit, CUL-1893.
//
// WHY THIS FILE EXISTS. The rule (`.claude/rules/ui.md` § Styling) has said "theme
// tokens only" since session one, and only colour was ever checked. The audit measured
// what prose alone bought: colour 99.7% tokens, fontSize 95%, spacing 83% (about 364
// raw, 221 off the grid), radius 85%. New files arrive clean, but editing a file does
// not clean it (83 files touched since 2026-10-05 still held 160 raw values), and
// `WhorlSpinner`, marked "add none" (CUL-1593), sat in 48 screens. A rule enforced by
// prose fires approximately never; a guard has zero recorded misses.
//
// WHAT IT CHECKS. One count per category, comments blanked first (guards/blankComments):
//
//   colour         a quoted hex literal ('#fff', "#0A0A0A") or an rgb()/rgba()/hsl() call
//   fontSize, lineHeight, letterSpacing, spacing (padding*, margin*, gap, rowGap,
//   columnGap), radius (border*Radius)
//                  a SITE whose value holds a non-zero numeric literal, as `key: …` or
//                  the JSX attribute `key={…}`. `theme.textSM * 1.45` counts (it is the
//                  missing line height scale typed by hand); `theme.space2` and `0` do not.
//   duration       a `duration:` / `delay:` with a non-zero literal anywhere, plus every
//                  `…Ms` / `…_MS` key or const given one in components/motion/, where
//                  the choreography lives and only some modules read theme.duration*.
//   whorlSpinner   a file that imports WhorlSpinner.
//
// A RATCHET, both directions, exact (the claudeMdBudget shape, no markers). A count
// above its ceiling reds: use the token. A count BELOW its ceiling also reds: lower the
// ceiling to the new count in the same PR, so the space a cleanup frees is never a
// budget the next PR grows back into. Never raise a ceiling to go green. Two PRs that
// both move a count and merge in either order: the second recounts on main (the
// message prints the number), which is a recount, never a raised ceiling.
//
// SCOPE BOUNDARY (stated, because an undocumented blind spot reads as coverage): it
// counts SITES, so swapping a raw 12 for a raw 13 is invisible; it reads one line of a
// value, so a ternary that wraps counts by its first line; it does not read constants/,
// lib/, hooks/ or widgets/ (the widget's palette has its own parity test,
// guards/widgetPalette.test.ts); `minHeight: 44` is not counted until the hit target
// token exists (PR-03b); a named colour ('white') is not a colour here; and a timer
// outside components/motion/ (a debounce, a TTL) is not a duration, since no motion
// token is meant to replace it.
//
// Files are read as bytes, not through a grep: `app/food/[id].tsx` holds NUL bytes, and
// a tool that sniffs for binaries skips it. The non-vacuity floor pins that it is read.

import * as fs from 'fs';
import * as path from 'path';
import { blankComments } from './blankComments';

const REPO_ROOT = path.resolve(__dirname, '..');
const SCANNED_DIRS = ['app', 'components'];
const MOTION_DIR = 'components/motion/';

/**
 * The ceilings, measured 2026-10-23 on main at b6373e6. A RATCHET: lower one whenever
 * its count falls, and never raise one.
 */
const CEILINGS = {
  colour: 8,
  fontSize: 71,
  lineHeight: 76,
  letterSpacing: 9,
  spacing: 369,
  radius: 83,
  duration: 62,
  whorlSpinner: 48,
} as const;

type Category = keyof typeof CEILINGS;

/** What to reach for instead, printed when a count rises. */
const REPAIR: Record<Category, string> = {
  colour: 'a colour token in constants/theme.ts (theme.color*)',
  fontSize: 'a type scale token (theme.textXS … theme.text2XL)',
  lineHeight: 'a line height token (theme.lineHeightXS / SM / Body / Signal)',
  letterSpacing: 'a tracking token (theme.trackingTight / Normal / Wide / Widest)',
  spacing: 'a spacing token (theme.spaceMicro, space0_5, space1 … space6)',
  radius: 'a radius token (theme.radiusXS / Small / Medium / Large / Full)',
  duration: 'a duration token (theme.durationFast / Medium / Slow) or an existing *_MOTION constant',
  whorlSpinner:
    'the tick, a skeleton or the screen\'s silhouette (.claude/rules/ui.md § Loading indicators); WhorlSpinner is retiring (CUL-1593)',
};

// A numeric literal that is not part of an identifier, a member (`theme.space1`) or a hex.
const NUMBER = /(?<![\w.$#])\d*\.?\d+(?![\w.])/g;
// One line of a value: up to the next `,` `}` `;` or newline.
const VALUE = String.raw`\s*(?::|=\{)\s*([^,}\n;]*)`;

const KEYED: Record<Exclude<Category, 'colour' | 'whorlSpinner'>, RegExp> = {
  fontSize: new RegExp(String.raw`\bfontSize` + VALUE, 'g'),
  lineHeight: new RegExp(String.raw`\blineHeight` + VALUE, 'g'),
  letterSpacing: new RegExp(String.raw`\bletterSpacing` + VALUE, 'g'),
  spacing: new RegExp(
    String.raw`\b(?:(?:padding|margin)(?:Top|Bottom|Left|Right|Horizontal|Vertical|Start|End)?|gap|rowGap|columnGap)` +
      VALUE,
    'g',
  ),
  radius: new RegExp(
    String.raw`\bborder(?:TopLeft|TopRight|BottomLeft|BottomRight|TopStart|TopEnd|BottomStart|BottomEnd)?Radius` + VALUE,
    'g',
  ),
  duration: new RegExp(String.raw`\b(?:duration|delay)` + VALUE, 'g'),
};
const MOTION_MS = /\b\w+(?:Ms|_MS)\s*[:=]\s*([^,}\n;]*)/g;
const COLOUR = /['"`]#(?:[0-9A-Fa-f]{3,4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})['"`]|\b(?:rgba?|hsla?)\(/g;
const WHORL_IMPORT = /\bimport\b[^;]*\bWhorlSpinner\b[^;]*\bfrom\b|\brequire\([^)]*WhorlSpinner/;

function holdsRawNumber(value: string): boolean {
  return (value.match(NUMBER) ?? []).some((n) => Number(n) !== 0);
}

/** Every counted site in one file's source, by category. */
function countStyleLiterals(source: string, rel: string): Record<Category, number> {
  const src = blankComments(source);
  const out = Object.fromEntries(Object.keys(CEILINGS).map((k) => [k, 0])) as Record<Category, number>;
  for (const [cat, re] of Object.entries(KEYED) as [keyof typeof KEYED, RegExp][]) {
    for (const m of src.matchAll(re)) if (holdsRawNumber(m[1])) out[cat] += 1;
  }
  if (rel.startsWith(MOTION_DIR)) {
    for (const m of src.matchAll(MOTION_MS)) if (holdsRawNumber(m[1])) out.duration += 1;
  }
  out.colour = (src.match(COLOUR) ?? []).length;
  out.whorlSpinner = WHORL_IMPORT.test(src) ? 1 : 0;
  return out;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out.sort();
}

const files = SCANNED_DIRS.flatMap(walk);
const perFile = new Map(
  files.map((rel) => [rel, countStyleLiterals(fs.readFileSync(path.join(REPO_ROOT, rel)).toString('utf8'), rel)]),
);
const totals = Object.fromEntries(
  (Object.keys(CEILINGS) as Category[]).map((cat) => [cat, [...perFile.values()].reduce((s, c) => s + c[cat], 0)]),
) as Record<Category, number>;

function topFiles(cat: Category): string[] {
  return [...perFile.entries()]
    .filter(([, c]) => c[cat] > 0)
    .sort((a, b) => b[1][cat] - a[1][cat])
    .slice(0, 10)
    .map(([rel, c]) => `    ${String(c[cat]).padStart(3)}  ${rel}`);
}

describe('the style literal ratchet: the scan (non-vacuity)', () => {
  it('reads app/ and components/, the NUL-holding food detail included', () => {
    expect(files.length).toBeGreaterThan(250);
    expect(files).toContain('app/food/[id].tsx');
    expect(files.some((f) => f.endsWith('.test.ts') || f.endsWith('.test.tsx'))).toBe(false);
    // The NUL file is read in full, not stopped at its first NUL (byte 17,313): its two
    // raw '#fff' sites sit past byte 47,000, so a truncating or binary-skipping read sees 0.
    const food = fs.readFileSync(path.join(REPO_ROOT, 'app/food/[id].tsx'));
    expect(food.indexOf(0)).toBeGreaterThan(-1);
    expect(food.indexOf(0)).toBeLessThan(food.lastIndexOf('#fff'));
    expect(perFile.get('app/food/[id].tsx')!.colour).toBeGreaterThan(0);
  });

  it('finds every category somewhere (a regex that matches nothing reads as clean)', () => {
    for (const cat of Object.keys(CEILINGS) as Category[]) expect({ cat, n: totals[cat] > 0 }).toEqual({ cat, n: true });
  });
});

describe('the style literal ratchet (CUL-2138)', () => {
  for (const cat of Object.keys(CEILINGS) as Category[]) {
    it(`${cat}: ${CEILINGS[cat]} hand typed sites, and no more`, () => {
      if (totals[cat] > CEILINGS[cat]) {
        throw new Error(
          [
            `${cat}: ${totals[cat]} hand typed sites under app/ and components/, ` +
              `${totals[cat] - CEILINGS[cat]} over the ceiling of ${CEILINGS[cat]}.`,
            '',
            `THE REPAIR: use ${REPAIR[cat]} for the value you added.`,
            'If no token fits, that is a design system question for CUL-1897, not a reason',
            'to type the value: raise it there.',
            '',
            'DO NOT raise the ceiling in guards/styleLiteralBudget.test.ts to go green.',
            '',
            `The files holding the most ${cat} sites now:`,
            ...topFiles(cat),
          ].join('\n'),
        );
      }
      expect(totals[cat]).toBeLessThanOrEqual(CEILINGS[cat]);
    });

    it(`${cat}: the ceiling follows the count down`, () => {
      if (totals[cat] < CEILINGS[cat]) {
        throw new Error(
          [
            `${cat}: ${totals[cat]} hand typed sites, below the ceiling of ${CEILINGS[cat]}. A cleanup landed.`,
            '',
            `THE REPAIR: set CEILINGS.${cat} to ${totals[cat]} in guards/styleLiteralBudget.test.ts`,
            'in this same PR, so the freed room is not a budget to regrow into.',
          ].join('\n'),
        );
      }
      expect(totals[cat]).toBeGreaterThanOrEqual(CEILINGS[cat]);
    });
  }
});

describe('the detector', () => {
  const count = (src: string, rel = 'components/x/Fixture.tsx') => countStyleLiterals(src, rel);

  it('counts a raw site in each category', () => {
    const src = [
      "import { WhorlSpinner } from '@/components/brand/WhorlSpinner';",
      'const s = StyleSheet.create({',
      "  a: { color: '#FFFFFF', backgroundColor: 'rgba(0,0,0,0.4)' },",
      '  b: { fontSize: 14, lineHeight: theme.textSM * 1.45, letterSpacing: 0.6 },',
      '  c: { paddingHorizontal: 12, marginTop: -6, gap: 6, borderTopLeftRadius: 10 },',
      '});',
      'Animated.timing(v, { toValue: 1, duration: 200, useNativeDriver: true });',
      '<SvgText fontSize={10} />;',
    ].join('\n');
    expect(count(src)).toEqual({
      colour: 2,
      fontSize: 2,
      lineHeight: 1,
      letterSpacing: 1,
      spacing: 3,
      radius: 1,
      duration: 1,
      whorlSpinner: 1,
    });
  });

  it('leaves tokens, zeros, comments and identifiers that merely contain digits alone', () => {
    const src = [
      '// fontSize: 14 in a comment, and #FFFFFF too',
      'const s = StyleSheet.create({',
      '  a: { color: theme.colorAccent, padding: theme.space2, margin: 0, gap: theme.space0_5 },',
      '  b: { fontSize: theme.textXS, lineHeight: theme.lineHeightSM, borderRadius: theme.radiusFull },',
      '  c: { paddingTop: insets.top, marginBottom: -StyleSheet.hairlineWidth },',
      '});',
      'Animated.timing(v, { duration: theme.durationFast, delay: 0 });',
      "const label = 'Dose #12';",
    ].join('\n');
    expect(Object.values(count(src)).every((n) => n === 0)).toBe(true);
  });

  it('counts a motion module\'s *Ms literals, and nobody else\'s timers', () => {
    const src = 'export const X_MOTION = { openMs: 370, closeMs: theme.durationMedium };\nconst HOLD_MS = 600;';
    expect(count(src, 'components/motion/xMotion.ts').duration).toBe(2);
    expect(count(src, 'components/home/Debounced.tsx').duration).toBe(0);
  });
});
