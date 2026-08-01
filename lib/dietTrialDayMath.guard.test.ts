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

  // B-442 (the day-counter row) is CLOSED by B-417 PR 7, and this test is now the
  // guard rather than the record of the divergence.
  //
  // `generate-report` used to keep its own counter: `Math.max(0, endDayNum - start
  // + 1)`, floored at 0 rather than 1 and anchored on the scope end rather than
  // today, so a future-dated `started_at` printed "day 0 of 14" on the vet report
  // where the card and Ask both said "Day 1". PR 7 deleted it. The report's day
  // number now comes from `computeTrialFacts`, which indexes local days through the
  // same `localDayIndexOf` the client does — so the two agree by construction rather
  // than by inspection, and a trial that has not started yet renders no block at all
  // instead of "day 0".
  it('the vet report no longer computes a diet-trial day span of its own (B-442)', () => {
    const report = read('supabase/functions/generate-report/report.ts');
    expect(report).not.toMatch(/daysElapsed:\s*Math\.max\(0,\s*endDayNum/);
    // `DietSummary.trial` is the protein-set view and must stay free of day math:
    // the field is what carried the second implementation. Match the FIELD, not the
    // word — the two surviving hits are comments explaining the deletion, and a
    // guard that forbids naming the thing it guards is a guard nobody can document.
    expect(report).not.toMatch(/^\s*daysElapsed:/m);
  });

  it('the vet report reads its day math through the shared predicate', () => {
    const trial = read('supabase/functions/generate-report/trial.ts');
    expect(trial).toMatch(/from '\.\.\/\.\.\/\.\.\/lib\/dietTrial\.ts'/);
    expect(trial).toMatch(/dayIndexOf\(/);
    // The one deliberate multiplication is the inverse — a day INDEX back into an
    // instant to name a calendar date. It never divides.
    expect(trial).not.toMatch(DAY_DIVISION);
    expect(trial).not.toMatch(MANUAL_MIDNIGHT);
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

    // B-441 closed the one carve-out this assertion used to hold open. The regimen
    // counter was the last day math on this screen — a different feature's counter,
    // left behind by B-421 on scope grounds and carrying the identical defect. It
    // now lives in `lib/medications` and routes through the same primitive, so the
    // screen holds NO day arithmetic at all and the count is exact, not a budget.
    const code = readCode('app/(tabs)/profile.tsx');
    expect(code).not.toMatch(DAY_DIVISION);
    expect(code).not.toMatch(MANUAL_MIDNIGHT);
    // Read the STRIPPED source: the comment left behind names the function it
    // replaced, and a guard that reds on its own documentation is a guard people
    // delete. (`readCode` exists for exactly this; use it on all three.)
    expect(code).not.toMatch(/function regimenDaysElapsed/);
    expect(code).toMatch(/regimenDaysElapsed\(/); // delegates instead
  });

  // B-441 found FIVE instances of one defect in a single feature, three of them in
  // files a previous fix had already edited. So the guard is written against the
  // CLASS, not the instances: an identifier-bound regex (`new Date(reg.started_at)`)
  // is defeated by renaming `reg` to `r`, and pins only the past. These two patterns
  // are what the class actually looks like in source.
  const DATE_KEY_VIA_UTC = /\.toISOString\(\)\s*\.\s*(split\(\s*['"]T['"]\s*\)\s*\[\s*0\s*\]|slice\(\s*0\s*,\s*10\s*\))/;
  const DATE_COL_VIA_NEW_DATE = /new Date\(\s*[A-Za-z_$][\w$.]*\.(started_at|ended_at|completed_at)\s*\)/;

  const DATE_COLUMN_SURFACES = [
    { file: 'app/(tabs)/profile.tsx', what: 'the Pet tab (regimen counter, Started line, End-regimen write)' },
    { file: 'components/profile/AddMedicationModal.tsx', what: 'the regimen setup modal (the WRITE path)' },
  ];

  it.each(DATE_COLUMN_SURFACES)('$what never round-trips a DATE column through UTC', ({ file }) => {
    const code = readCode(file);
    // A UTC day key from an instant. `toLocalDayKey` is the local-component
    // equivalent and is what a DATE column must be written with — an owner AHEAD of
    // UTC picking "today" otherwise stores YESTERDAY, permanently.
    expect(code).not.toMatch(DATE_KEY_VIA_UTC);
    // The read direction: `new Date('2026-07-31')` is UTC midnight, which is the
    // PREVIOUS local day behind UTC. Stored day keys are parsed with
    // `dayKeyToLocalDate` / indexed with `localDayIndexOf`.
    expect(code).not.toMatch(DATE_COL_VIA_NEW_DATE);
  });

  it('the trial-facts loader DELEGATES coverage rather than keying its own day', () => {
    // This assertion is the one the previous version of itself asked for. It read:
    // "B-417 PR 5 pinned the metric in `lib/dietTrial.computeTrialFacts`, but the
    // WIRING that would route this loader through it is deferred to B-474 … When
    // B-474 lands, this assertion becomes a delegation check (`computeTrialFacts(`)
    // instead." B-533 landed it, so it does.
    //
    // The stakes are unchanged and are why the guard survives in a new form: the
    // denominator is a LOCAL-day count, and the old numerator used `toDateString()`
    // on a UTC-parsed timestamp — halves of a ratio on two different clocks, which
    // is how Home rendered "6 of 5 days logged" beside the profile card's own
    // number for the same pet. A second implementation is what made that possible,
    // so the guard now asserts there is only one.
    const src = readCode('lib/dietTrialFacts.ts');
    expect(src).toMatch(/computeTrialFacts\(/);
    // No second coverage metric: the day bucketing, the treat exclusion and the
    // §10 S3 head clip all live in the shared module now. Passing the module's
    // OWN numbers through is the point; computing a rival pair here is what this
    // forbids.
    expect(src).not.toMatch(/function readCoverage/);
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
