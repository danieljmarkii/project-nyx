// B-421 — the day counter has exactly ONE implementation. Guard test.
//
// The numeric oracle (lib/analytics.test.ts, "timezone honesty") pins WHAT the
// counter should say. This pins that every surface actually ASKS it, which is the
// half a value test cannot cover: four implementations that each independently
// happen to be right today drift apart the moment one of them is edited, and that is
// precisely how B-421 came to exist — `getDietTrialProgress`, `ask/tools.ts`,
// `useTrend.ts` and `profile.tsx` each grew their own arithmetic and ended up
// disagreeing by up to two days on a single screen unlock.
//
// So this reads the sources and asserts each consumer delegates and carries no day
// arithmetic of its own. A source scan is a blunt instrument, but the failure it
// catches is a silent wrong number on a clinical surface, and the alternative —
// noticing a fifth implementation in review — is exactly what did not happen.

// `tsconfig.json` pins `types: ["jest"]`, so node globals are not ambient app-wide
// (deliberately — this is an RN bundle, not a node program). This test genuinely
// needs the filesystem, so it pulls the node types in file-scope rather than
// widening the whole app's ambient environment for one suite.
/// <reference types="node" />
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Day arithmetic: a millisecond span divided into days, in any of the spellings the
 *  four original implementations used. Matches `/ 86_400_000`, `/ 86400000`,
 *  `/ MS_PER_DAY`, and `/ (1000 * 60 * 60 * 24)`. */
const DAY_DIVISION = /\/\s*(86_400_000|86400000|MS_PER_DAY|\(\s*1000\s*\*\s*60\s*\*\s*60\s*\*\s*24\s*\))/;

/** Flooring an instant to midnight by hand — the profile.tsx shape. */
const MANUAL_MIDNIGHT = /setHours\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/;

describe('B-421 — one diet-trial day counter, not four', () => {
  const CONSUMERS = [
    { file: 'hooks/useTrend.ts', what: 'the Home trend strip' },
    { file: 'app/(tabs)/profile.tsx', what: 'the trial card' },
    { file: 'lib/widgetResolution.ts', what: 'the widget header' },
  ];

  it.each(CONSUMERS)('$what ($file) delegates to getDietTrialProgress', ({ file }) => {
    expect(read(file)).toMatch(/getDietTrialProgress\s*\(/);
  });

  it('the Home trend strip computes no day span of its own', () => {
    expect(read('hooks/useTrend.ts')).not.toMatch(DAY_DIVISION);
  });

  it('the widget resolver computes no day span of its own', () => {
    expect(read('lib/widgetResolution.ts')).not.toMatch(DAY_DIVISION);
  });

  it('the trial card no longer floors the trial start to midnight by hand', () => {
    const src = read('app/(tabs)/profile.tsx');

    // Slice the trial loader out by name. Assert the bounds are real and ordered
    // first: `slice(a, b)` with a > b returns '', and an empty haystack passes every
    // `not.toMatch` below — the test would fail open, which is the one thing a guard
    // test may never do.
    const start = src.indexOf('const loadDietTrial');
    const end = src.indexOf('}, [activePet?.id]);', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const trialLoader = src.slice(start, end);
    expect(trialLoader).toMatch(/getDietTrialProgress\(/); // the slice really is the loader
    expect(trialLoader).not.toMatch(MANUAL_MIDNIGHT);
    expect(trialLoader).not.toMatch(DAY_DIVISION);

    // The only hand-rolled midnight left in this file is regimenDaysElapsed — a
    // different feature's counter, deliberately left alone and annotated (B-441).
    const occurrences = src.match(new RegExp(MANUAL_MIDNIGHT.source, 'g')) ?? [];
    expect(occurrences).toHaveLength(2); // both inside regimenDaysElapsed
    expect(src).toMatch(/function regimenDaysElapsed/);
  });

  it('the boundary is defined once, in lib/utils', () => {
    const analytics = read('lib/analytics.ts');
    const progress = analytics.slice(analytics.indexOf('export function getDietTrialProgress'));
    const body = progress.slice(0, progress.indexOf('\n}'));
    // The helper indexes calendar days; it must not have regrown a ms-span divide.
    expect(body).toMatch(/localDayIndexOf\(/);
    expect(body).toMatch(/localDayIndex\(/);
    expect(body).not.toMatch(DAY_DIVISION);
  });

  it('the Edge Function port buckets by the owner timezone, not raw UTC', () => {
    const tools = read('supabase/functions/ask/tools.ts');
    const fn = tools.slice(tools.indexOf('export function dietTrialStatus'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toMatch(/zonedDayIndexOf\(/);
    expect(body).toMatch(/zonedDayIndex\(/);
    expect(body).not.toMatch(DAY_DIVISION);
    // and the caller actually hands it the zone it already loads for time_of_day
    expect(read('supabase/functions/ask/answer.ts')).toMatch(/dietTrialStatus\(ctx\.trial,\s*ctx\.nowMs,\s*ctx\.timezone\)/);
  });
});
