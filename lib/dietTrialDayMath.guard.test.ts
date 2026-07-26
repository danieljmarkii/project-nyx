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

/** Source with whole-line comments removed. This file's assertions are mostly
 *  `not.toMatch`, and the modules it guards NAME the defects they fixed in their
 *  own header comments — so matching raw source makes a good comment fail the
 *  test. Only full-line comments are stripped, which is where that prose lives;
 *  a trailing comment on a line of code is left alone. */
const readCode = (p: string) =>
  read(p)
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
    })
    .join('\n');

/** Day arithmetic: a millisecond span divided into days, in any of the spellings the
 *  four original implementations used. Matches `/ 86_400_000`, `/ 86400000`,
 *  `/ MS_PER_DAY`, and `/ (1000 * 60 * 60 * 24)`. */
const DAY_DIVISION = /\/\s*(86_400_000|86400000|MS_PER_DAY|\(\s*1000\s*\*\s*60\s*\*\s*60\s*\*\s*24\s*\))/;

/** Flooring an instant to midnight by hand — the profile.tsx shape. */
const MANUAL_MIDNIGHT = /setHours\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/;

describe('B-421 — one diet-trial day counter, not four', () => {
  // B-417 PR 4 moved the CARD's consumer: the trial card and the Home strip both
  // render from `lib/dietTrialCard`, which is now the only client surface that
  // asks the question. `app/(tabs)/profile.tsx` and `app/(tabs)/index.tsx` reach
  // it through the resolver, so they are asserted on delegation to THAT rather
  // than on a direct call they no longer make.
  const CONSUMERS = [
    { file: 'lib/dietTrialCard.ts', what: 'the trial card + Home strip resolver' },
    { file: 'lib/widgetResolution.ts', what: 'the widget header' },
  ];

  it.each(CONSUMERS)('$what ($file) delegates to getDietTrialProgress', ({ file }) => {
    expect(read(file)).toMatch(/getDietTrialProgress\s*\(/);
  });

  const RESOLVER_CONSUMERS = [
    { file: 'app/(tabs)/profile.tsx', what: 'the Pet-tab card', fn: 'resolveTrialCard' },
    { file: 'app/(tabs)/index.tsx', what: 'the Home strip', fn: 'resolveTrialStrip' },
  ];

  it.each(RESOLVER_CONSUMERS)('$what ($file) renders through $fn', ({ file, fn }) => {
    expect(read(file)).toMatch(new RegExp(`${fn}\\s*\\(`));
  });

  it('the resolver computes no day span of its own', () => {
    const src = readCode('lib/dietTrialCard.ts');
    // One deliberate exception: `formatTrialDate` multiplies a day INDEX back into
    // an instant to name a calendar date. That is the inverse of the boundary
    // helper, not a second definition of it — and it never divides.
    expect(src).not.toMatch(DAY_DIVISION);
    expect(src).not.toMatch(MANUAL_MIDNIGHT);
  });

  it('the Home trend zone no longer derives a trial day count AT ALL', () => {
    // Before B-417 PR 4 this file computed its own trial-coverage ratio and
    // rendered it as "% food compliance" — a second, unlisted metric with the
    // same unfiltered defect as the card's, on a chart it also displaced. The
    // whole derivation is gone, which is a stronger guarantee than "it delegates":
    // there is nothing left here to drift.
    const src = readCode('hooks/useTrend.ts');
    expect(src).not.toMatch(DAY_DIVISION);
    expect(src).not.toMatch(/getDietTrialProgress/);
    expect(src).not.toMatch(/trialDaysElapsed|trialCompliantDays|trialTargetDays/);
    expect(src).not.toMatch(/compliance/i);
  });

  // Scope honesty: the "one implementation" claim is CLIENT-side. `generate-report`
  // keeps its own counter, deliberately anchored on the report's scope end rather
  // than today, and floored at 0 rather than 1 — so a future-dated start prints
  // "day 0 of 14" where the card says "Day 1 of 14". Changing the vet report's
  // headline is not this PR's call; B-442 owns reconciling it. This test exists so
  // the divergence is a recorded fact rather than a thing someone rediscovers.
  it('records the vet report as a KNOWN separate counter (B-442), not an oversight', () => {
    const report = read('supabase/functions/generate-report/report.ts');
    expect(report).toMatch(/daysElapsed:\s*Math\.max\(0,\s*endDayNum/);
  });

  it('the widget resolver computes no day span of its own', () => {
    expect(read('lib/widgetResolution.ts')).not.toMatch(DAY_DIVISION);
  });

  it('the trial card screen carries no trial day math of its own', () => {
    const src = read('app/(tabs)/profile.tsx');

    // The loader this used to slice out is gone: B-417 PR 4 moved the read into
    // `lib/dietTrialFacts` and the arithmetic into `lib/dietTrialCard`, so the
    // screen holds neither. Assert the ABSENCE positively rather than slicing a
    // block that no longer exists — a slice with no bounds returns '' and passes
    // every `not.toMatch`, which is the one thing a guard test may never do.
    expect(src).not.toMatch(/const loadDietTrial/);
    expect(src).toMatch(/resolveTrialCard\(/);

    // The one day-division left in this file belongs to regimenDaysElapsed — a
    // different feature's counter, deliberately left alone and annotated (B-441).
    const divisions = readCode('app/(tabs)/profile.tsx')
      .match(new RegExp(DAY_DIVISION.source, 'g')) ?? [];
    expect(divisions).toHaveLength(1);

    // The only hand-rolled midnight left in this file is regimenDaysElapsed — a
    // different feature's counter, deliberately left alone and annotated (B-441).
    const occurrences = src.match(new RegExp(MANUAL_MIDNIGHT.source, 'g')) ?? [];
    expect(occurrences).toHaveLength(2); // both inside regimenDaysElapsed
    expect(src).toMatch(/function regimenDaysElapsed/);
  });

  it('the trial-facts loader keys coverage on the SAME clock as the denominator', () => {
    // The denominator is a LOCAL-day count. The old numerator used
    // `toDateString()` on a UTC-parsed timestamp — halves of a ratio on two
    // different clocks, which is how Home rendered "6 of 5 days logged" beside
    // the profile card's own number for the same pet.
    //
    // B-417 PR 5 moved BOTH halves into `lib/dietTrial.computeTrialFacts`, so the
    // loader no longer keys days at all for coverage; what it still keys locally
    // is the free-fed count and the query's lower bound. Delegation is asserted
    // here, and the arithmetic is asserted in the predicate's own case below.
    const src = readCode('lib/dietTrialFacts.ts');
    expect(src).toMatch(/computeTrialFacts\(/);
    // The loader no longer buckets a feeding into a day AT ALL — a stronger
    // guarantee than "it uses the local helper". The only calendar work left here
    // is the query's lower bound, which is deliberately loose so the local-day
    // filter inside the predicate is what decides membership.
    expect(src).not.toMatch(/toLocalDayKey\(new Date\(r\.occurred_at\)\)/);
    expect(src).not.toMatch(/toDateString\(\)/);
    expect(src).not.toMatch(DAY_DIVISION);
  });

  it('the shared predicate indexes local days through lib/utils, not a ms divide', () => {
    // `lib/dietTrial.ts` is the fifth surface that has to answer "which local day
    // is this", and the one the vet report and Ask will inherit at PR 7. It uses
    // the same `localDayIndexOf` oracle as `getDietTrialProgress` — a ms-span
    // divide here would put the exposure window and the day counter on two clocks
    // and disagree with the card by up to a day at either end.
    const src = readCode('lib/dietTrial.ts');
    expect(src).toMatch(/localDayIndexOf\(/);
    expect(src).not.toMatch(DAY_DIVISION);
    expect(src).not.toMatch(MANUAL_MIDNIGHT);
  });

  it('the log-time contaminant path asks for the day index, never divides for it', () => {
    const src = readCode('lib/trialContaminant.ts');
    expect(src).toMatch(/localDayIndex\(/);
    expect(src).not.toMatch(DAY_DIVISION);
    expect(src).not.toMatch(MANUAL_MIDNIGHT);
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
