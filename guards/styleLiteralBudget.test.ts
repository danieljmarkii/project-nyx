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
//                  a SITE whose value holds a non-zero numeric literal, as `key: …`,
//                  `'key': …` or the JSX attribute `key={…}`. The value runs to the next
//                  `,` `;` or newline at bracket depth 0, so `Math.max(insets.bottom, 12)`
//                  and `Platform.select({ ios: 12 })` count. `theme.textSM * 1.45` counts
//                  (the missing line height scale, typed by hand); `theme.space2`, `0` and
//                  an index (`SIZES[2]`) do not.
//   duration       a `duration:` / `delay:`, a `.duration(…)` / `.delay(…)` builder or a
//                  `withDelay(…)` with a non-zero literal anywhere, plus every `…Ms` /
//                  `…_MS` key or const given one in a file that animates (components/
//                  motion/, or one calling Animated, withTiming and kin, LayoutAnimation).
//   whorlSpinner   a file that imports or re-exports WhorlSpinner, statically or not.
//   hitTarget      a height / width / minHeight / minWidth site whose value holds a
//                  literal 44: the touch floor typed by hand, which theme.hitTarget names
//                  (CUL-2144, PR-03b; ~180 sites, CUL-658).
//
// THE MESSAGE NAMES THE TOKEN (CUL-2144). A red count prints each value its category's
// scale has a token for (6 → theme.space0_75), read from constants/theme.ts itself, so
// the list cannot drift from the scale it points at.
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
// value, which stops at a newline outside brackets, so a wrapped ternary counts by its first line; it does not read constants/,
// lib/, hooks/ or widgets/ (the widget's palette has its own parity test,
// guards/widgetPalette.test.ts); a 44 that is a hit target under any other key (a
// `size={44}`, a hitSlop sum) is not a hitTarget site; a named colour ('white'), a hex inside a longer string
// ('1px #fff') and a hand typed alpha on a token (theme.colorAccent + '33') are not
// colours here; a barrel alias of WhorlSpinner, and a second use in a file already
// counted, are invisible; and a `…_MS` timer in a file that does not animate (a
// debounce, a TTL) is not a duration, since no motion token is meant to replace it,
// while one in a file that does animate is counted, debounce or not.
//
// Files are read as bytes, not through a grep: `app/food/[id].tsx` holds NUL bytes, and
// a tool that sniffs for binaries skips it. The non-vacuity floor pins that it is read.

import * as fs from 'fs';
import * as path from 'path';
import { blankComments } from './blankComments';
import { theme } from '../constants/theme';

const REPO_ROOT = path.resolve(__dirname, '..');
const SCANNED_DIRS = ['app', 'components'];
const MOTION_DIR = 'components/motion/';

/**
 * The ceilings, measured 2026-10-23 on main at b6373e6. A RATCHET: lower one whenever
 * its count falls, and never raise one.
 */
const CEILINGS = {
  colour: 8,
  fontSize: 23, // 71 until CUL-1910 moved food capture onto the kit; 48 after CUL-1911 (the pet profile); 41 after CUL-1908; 23 after CUL-1909 (the event editor)
  lineHeight: 66, // 67 until CUL-1909
  letterSpacing: 8,
  spacing: 317, // 336 until CUL-1909
  radius: 75,
  duration: 90,
  whorlSpinner: 43,
  hitTarget: 176, // added by CUL-2144 at 199, 2026-10-23; 198 after CUL-658 moved IntakeFirstMealSheet's row; 195 after CUL-1910; 188 after CUL-1911; 176 after CUL-1908
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
  hitTarget: 'theme.hitTarget (the 44pt touch floor)',
};

/** The theme keys holding each category's scale, so the message can name a value's token. */
const SCALE_PREFIX: Partial<Record<Category, RegExp>> = {
  fontSize: /^text(?!Style)/,
  lineHeight: /^lineHeight/,
  letterSpacing: /^tracking/,
  spacing: /^space/,
  radius: /^radius/,
  duration: /^duration/,
  hitTarget: /^hitTarget$/,
};

/** `6 → theme.space0_75` for every numeric token in a category's scale, smallest first. */
function scaleTokens(cat: Category): string[] {
  const prefix = SCALE_PREFIX[cat];
  if (!prefix) return [];
  return (Object.entries(theme) as [string, unknown][])
    .filter((e): e is [string, number] => prefix.test(e[0]) && typeof e[1] === 'number')
    .sort((a, b) => a[1] - b[1])
    .map(([k, v]) => `${v} → theme.${k}`);
}

// A numeric literal that is not part of an identifier, a member (`theme.space1`), an
// index (`SIZES[2]`) or a hex.
const NUMBER = /(?<![\w.$#[])\d*\.?\d+(?![\w.])/g;
// The key's separator, `key:`, `'key':` or `key={`; the value is read by valueAt().
const VALUE = String.raw`['"]?\s*(?::|=\{)`;

const KEYED: Record<Exclude<Category, 'colour' | 'whorlSpinner' | 'hitTarget'>, RegExp> = {
  fontSize: new RegExp(String.raw`\bfontSize` + VALUE, 'g'),
  lineHeight: new RegExp(String.raw`\blineHeight` + VALUE, 'g'),
  letterSpacing: new RegExp(String.raw`\bletterSpacing` + VALUE, 'g'),
  spacing: new RegExp(
    String.raw`\b(?:(?:padding|margin)(?:Top|Bottom|Left|Right|Horizontal|Vertical|Start|End)?|gap|rowGap|columnGap)` +
      VALUE,
    'g',
  ),
  radius: new RegExp(
    String.raw`\bborder\w*Radius` + VALUE,
    'g',
  ),
  duration: new RegExp(String.raw`\b(?:duration|delay)` + VALUE + String.raw`|\.(?:duration|delay)\(|\bwithDelay\(`, 'g'),
};
const BOX_SIDE = new RegExp(String.raw`\b(?:minHeight|minWidth|height|width)` + VALUE, 'g');
const FORTY_FOUR = /(?<![\w.$#[])44(?![\w.])/;
const MOTION_MS = /\b\w+(?:Ms|_MS)\s*[:=]/g;
const ANIMATES =
  /\bAnimated\.(?:timing|spring|decay|delay|sequence|stagger|parallel)\b|\bwith(?:Timing|Spring|Delay|Sequence|Repeat)\(|\bLayoutAnimation\./;
const COLOUR = /['"`]#(?:[0-9A-Fa-f]{3,4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})['"`]|\b(?:rgba?|hsla?)\(/g;
const WHORL_IMPORT =
  /\b(?:import|export)\b[^;]*\bWhorlSpinner\b[^;]*\bfrom\b|\b(?:require|import)\(\s*['"][^'"]*WhorlSpinner/;

/** The value that starts at `from`: up to the next `,` `;` or newline at depth 0, or its closing bracket. */
function valueAt(src: string, from: number): string {
  let depth = 0;
  let i = from;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) break;
      depth -= 1;
    } else if (depth === 0 && (c === ',' || c === ';' || c === '\n')) break;
  }
  return src.slice(from, i);
}

function holdsRawNumber(value: string): boolean {
  // An object is a style NAMED like a key (`gap: { … }` in a StyleSheet), not a value.
  if (/^\s*\{/.test(value)) return false;
  return (value.match(NUMBER) ?? []).some((n) => Number(n) !== 0);
}

/** Every counted site in one file's source, by category. */
function countStyleLiterals(source: string, rel: string): Record<Category, number> {
  const src = blankComments(source);
  const out = Object.fromEntries(Object.keys(CEILINGS).map((k) => [k, 0])) as Record<Category, number>;
  for (const [cat, re] of Object.entries(KEYED) as [keyof typeof KEYED, RegExp][]) {
    for (const m of src.matchAll(re)) if (holdsRawNumber(valueAt(src, m.index + m[0].length))) out[cat] += 1;
  }
  if (rel.startsWith(MOTION_DIR) || ANIMATES.test(src)) {
    for (const m of src.matchAll(MOTION_MS)) if (holdsRawNumber(valueAt(src, m.index + m[0].length))) out.duration += 1;
  }
  for (const m of src.matchAll(BOX_SIDE)) if (FORTY_FOUR.test(valueAt(src, m.index + m[0].length))) out.hitTarget += 1;
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
            ...(scaleTokens(cat).length ? [`Each value's token: ${scaleTokens(cat).join(', ')}.`] : []),
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
      '  c: { paddingHorizontal: 12, marginTop: -6, gap: 6, borderTopLeftRadius: 10, minHeight: 44, width: 44 },',
      '});',
      'Animated.timing(v, { toValue: 1, duration: 200, useNativeDriver: true });',
      '<SvgText fontSize={10} />;',
      "const q = { 'paddingTop': 4, borderStartStartRadius: 3 };",
      'const w = { paddingBottom: Math.max(insets.bottom, 12), gap: Platform.select({ ios: 12, default: 8 }) };',
      'const e = FadeIn.duration(250).delay(80);',
      "export { WhorlSpinner } from './WhorlSpinner';",
    ].join('\n');
    expect(count(src)).toEqual({
      colour: 2,
      fontSize: 2,
      lineHeight: 1,
      letterSpacing: 1,
      spacing: 6,
      radius: 2,
      duration: 3,
      whorlSpinner: 1,
      hitTarget: 2,
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
      'const f = { fontSize: SIZES[2], gap: GAPS[1] };',
      'const named = StyleSheet.create({ gap: { flex: 1 } });',
      'const box = { minHeight: theme.hitTarget, height: 440, maxHeight: 44, borderWidth: 1 };',
    ].join('\n');
    expect(Object.values(count(src)).every((n) => n === 0)).toBe(true);
  });

  it('counts *Ms literals where something animates, and nobody else\'s timers', () => {
    const src = 'export const X_MOTION = { openMs: 370, closeMs: theme.durationMedium };\nconst HOLD_MS = 600;';
    expect(count(src, 'components/motion/xMotion.ts').duration).toBe(2);
    expect(count(src, 'components/home/Debounced.tsx').duration).toBe(0);
    const fades = 'const FADE_MS = 150;\nAnimated.timing(v, { toValue: 1, duration: FADE_MS }).start();';
    expect(count(fades, 'components/log/Fab.tsx').duration).toBe(1);
  });

  it('names the token for each value on the scale, read from the theme', () => {
    expect(scaleTokens('spacing')).toEqual(expect.arrayContaining(['6 → theme.space0_75', '12 → theme.space1_5']));
    expect(scaleTokens('lineHeight')).toContain('19 → theme.lineHeightSMLoose');
    expect(scaleTokens('hitTarget')).toEqual(['44 → theme.hitTarget']);
    expect(scaleTokens('fontSize')).toContain('13 → theme.textSM');
    expect(scaleTokens('colour')).toEqual([]);
  });

  it('counts a dynamic import of WhorlSpinner', () => {
    expect(count("const W = React.lazy(() => import('@/components/brand/WhorlSpinner'));").whorlSpinner).toBe(1);
  });
});
