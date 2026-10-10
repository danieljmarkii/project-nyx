// CUL-1691 PR 2 (spec §2.4, §3 item 2) — the completion card's motion, as numbers.
//
// What only a pure test can answer: `easedSegment` is exact at its ends, monotonic and
// close to the curve it samples; calm and celebrate share their physics; each path is at
// rest within its own STATED budget (C-34, C-38: the budgets are never derived from the
// beats they bound, so retuning a beat past its budget reds here); and the derived
// constants (`checkDelayMs`, `checkBox`) still match what they were derived from.

import { Easing } from 'react-native';
import {
  CARD_CLOCK_END_MS, COMPLETION_MOTION, EASED_SEGMENT_KNOTS, EASE, checkRevealFor, easedAt, easedSegmentRanges,
  haloOpacityAt, landingTailRestMs, logPathBeats, logPathRestMs, riseArrivalMs,
} from './completionMotion';
import { CHECK_PATH_D, CHECK_STROKE_WIDTH } from '../ui/CompletionMark';
import { FOLD_MOTION } from './foldMotion';
import { SHEET_MOTION, SHEET_SPRING } from './sheetMotion';
import { LOOK_MOTION } from './lookMotion';
import { DRAW_IN_MOTION } from './drawInMotion';
import { theme } from '../../constants/theme';

const M = COMPLETION_MOTION;

/** The piecewise-linear value of a sampled segment at `x`. */
function sampled(r: { inputRange: number[]; outputRange: number[] }, x: number): number {
  const { inputRange: i, outputRange: o } = r;
  if (x <= i[0]) return o[0];
  if (x >= i[i.length - 1]) return o[o.length - 1];
  for (let k = 1; k < i.length; k += 1) {
    if (x <= i[k]) return o[k - 1] + ((o[k] - o[k - 1]) * (x - i[k - 1])) / (i[k] - i[k - 1]);
  }
  return o[o.length - 1];
}

describe('easedSegment', () => {
  const curves = [
    ['out quad', EASE.fade],
    ['out cubic', EASE.disc],
    ['in-out quad', EASE.pen],
    ['in cubic', EASE.exit],
  ] as const;

  it.each(curves)('%s: exact endpoints, clamped outside, monotonic, within 0.5%% of the curve', (_, easing) => {
    const r = easedSegmentRanges(90, 160, 0.6, 1, easing);
    expect(r.inputRange).toHaveLength(EASED_SEGMENT_KNOTS + 1);
    expect(r.inputRange[0]).toBe(90);
    expect(r.inputRange[EASED_SEGMENT_KNOTS]).toBe(250);
    expect(r.outputRange[0]).toBe(0.6);
    expect(r.outputRange[EASED_SEGMENT_KNOTS]).toBe(1);
    expect(sampled(r, 0)).toBe(0.6);
    expect(sampled(r, 999)).toBe(1);
    let prev = -Infinity;
    let maxErr = 0;
    for (let x = 90; x <= 250; x += 0.25) {
      const y = sampled(r, x);
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
      maxErr = Math.max(maxErr, Math.abs(y - easedAt(x, 90, 160, 0.6, 1, easing)));
    }
    expect(maxErr / 0.4).toBeLessThanOrEqual(0.005);
  });

  it('a falling segment is exact at its ends too', () => {
    const r = easedSegmentRanges(0, 180, 1, 0, Easing.out(Easing.quad));
    expect(r.outputRange[0]).toBe(1);
    expect(r.outputRange[r.outputRange.length - 1]).toBe(0);
  });
});

describe('COMPLETION_MOTION — the constants answer the questions they were lifted from (C-30, C-34)', () => {
  it('mirrors its sources by import', () => {
    expect(M.groundInMs).toBe(theme.durationFast);
    expect(M.riseSpring).toBe(SHEET_SPRING);
    expect(M.discFromScale).toBe(LOOK_MOTION.ringFromScale);
    expect(M.vesselFromScale).toBe(DRAW_IN_MOTION.barFromScale);
    expect(M.checkWriteMs).toBe(FOLD_MOTION.railLeadMs);
    expect(M.unwriteMs).toBe(FOLD_MOTION.leaveMs);
    expect(M.exitMs).toBe(SHEET_MOTION.exitMs);
    expect(M.exitDriftPt).toBe(FOLD_MOTION.driftPt);
    expect(M.crossfadeMs).toBe(SHEET_MOTION.crossfadeMs);
    expect(M.valveSlackMs).toBe(2 * FOLD_MOTION.settleSlackMs);
  });

  it('checkDelayMs: the disc reaches 0.97 at or before the pen starts (the continuous crossing)', () => {
    // Solve 0.6 + 0.4·(1 − (1 − t)³) = 0.97 for t, in ms.
    const t = 1 - Math.cbrt(1 - (0.97 - M.discFromScale) / (1 - M.discFromScale));
    const crossingMs = t * M.groundInMs;
    expect(crossingMs).toBeCloseTo(86.7, 1);
    expect(crossingMs).toBeLessThanOrEqual(M.checkDelayMs);
    expect(easedAt(M.checkDelayMs, 0, M.groundInMs, M.discFromScale, 1, EASE.disc)).toBeGreaterThanOrEqual(0.97);
  });

  it('checkBox: the path is written left to right, and the box holds every stroke', () => {
    // "M10 16.6l4.1 4.1 8-8.6": one absolute move, then relative line pairs.
    const nums = CHECK_PATH_D.replace(/^M/, '').split(/l|\s+|(?=-)/).filter(Boolean).map(Number);
    const pts: [number, number][] = [[nums[0], nums[1]]];
    for (let i = 2; i < nums.length; i += 2) {
      const [x, y] = pts[pts.length - 1];
      pts.push([x + nums[i], y + nums[i + 1]]);
    }
    expect(pts).toHaveLength(3);
    for (let i = 1; i < pts.length; i += 1) expect(pts[i][0]).toBeGreaterThan(pts[i - 1][0]);
    const half = CHECK_STROKE_WIDTH / 2;
    const b = M.checkBox;
    for (const [x, y] of pts) {
      expect(x - half).toBeGreaterThanOrEqual(b.x);
      expect(x + half).toBeLessThanOrEqual(b.x + b.w);
      expect(y - half).toBeGreaterThanOrEqual(b.y);
      expect(y + half).toBeLessThanOrEqual(b.y + b.h);
    }
  });

  it('checkReveal: the window on iOS, the measured-safe cover on Android', () => {
    expect(checkRevealFor('ios')).toBe('window');
    expect(checkRevealFor('android')).toBe('cover');
  });
});

describe('the plans end inside their stated budgets', () => {
  it('the rise is the clamped spring: it reaches rest at its first crossing, about 213ms', () => {
    expect(riseArrivalMs()).toBeGreaterThan(200);
    expect(riseArrivalMs()).toBeLessThan(225);
  });

  it('celebrate, from /log: at rest by logPathBudgetMs', () => {
    expect(logPathRestMs('celebrate')).toBeLessThanOrEqual(M.logPathBudgetMs);
  });

  it('calm: at rest by calmBudgetMs, and the halo never mounts', () => {
    expect(logPathRestMs('calm')).toBeLessThanOrEqual(M.calmBudgetMs);
  });

  it('the + path after landed (fill, then gold): at rest by landingTailBudgetMs', () => {
    expect(landingTailRestMs('celebrate')).toBeLessThanOrEqual(M.landingTailBudgetMs);
    expect(landingTailRestMs('calm')).toBeLessThanOrEqual(M.landingTailBudgetMs);
  });

  it('calm and celebrate share every beat but the gold', () => {
    const b = logPathBeats();
    expect(logPathRestMs('calm')).toBe(Math.max(b.rise[1], b.fade[1], b.disc[1], b.check[1], b.words[1]));
    expect(logPathRestMs('celebrate')).toBe(Math.max(logPathRestMs('calm'), b.halo[1]));
  });

  it('the card clock ends with the words, and its valve after its slack', () => {
    expect(CARD_CLOCK_END_MS).toBe(300);
    expect(CARD_CLOCK_END_MS + M.valveSlackMs).toBe(360);
  });

  it('the halo pins exactly: 0 before its delay, 1 at its end', () => {
    expect(haloOpacityAt(0, M.haloDelayMs)).toBe(0);
    expect(haloOpacityAt(M.haloDelayMs, M.haloDelayMs)).toBe(0);
    expect(haloOpacityAt(M.haloDelayMs + M.haloFadeMs, M.haloDelayMs)).toBe(1);
    expect(haloOpacityAt(M.haloFadeMs, 0)).toBe(1);
  });
});

// §2.5: every beat on the native driver, and no react-native-svg prop animated (an
// animated `G` freezes on Fabric, B-322). Read off the source of every file the motion
// lives in, comments blanked so this header's own words are not a match.
describe('the engines', () => {
  const fs = jest.requireActual<typeof import('fs')>('fs');
  const path = jest.requireActual<typeof import('path')>('path');
  const ROOT = path.resolve(__dirname, '../..');
  const FILES = [
    'components/motion/completionMotion.ts',
    'components/ui/CompletionMark.tsx',
    'components/ui/MealMark.tsx',
    'components/ui/MealCompletionCard.tsx',
  ];
  const code = (rel: string) =>
    fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it.each(FILES)('%s: no JS-driven animation and no animated SVG node', (rel) => {
    const src = code(rel);
    expect(src).not.toMatch(/useNativeDriver:\s*false/);
    expect(src).not.toMatch(/createAnimatedComponent/);
  });

  it('the motion module holds no JSX and imports no component file', () => {
    // A `.ts` file cannot hold JSX: the compiler is the check.
    expect(fs.existsSync(path.join(ROOT, 'components/motion/completionMotion.ts'))).toBe(true);
    const src = code('components/motion/completionMotion.ts');
    const imports = Array.from(src.matchAll(/from\s+'([^']+)'/g)).map((m) => m[1]);
    for (const i of imports) expect(i).not.toMatch(/\/components\/|\.\/[A-Z]|\.\.\/ui\//);
  });
});
