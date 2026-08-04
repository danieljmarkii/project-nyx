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

/** The INVERSE shape — a day index multiplied back into a ms instant. B-421's
 *  guard matched division only, so `lib/dietTrialOutcomeFacts.ts` grew its own
 *  `index * MS_PER_DAY` and evaded it (B-517): that multiplication is where PR 6's
 *  headline day-key INVERSION bug actually lived, and the guard could not see it.
 *
 *  This is applied ONLY to files that must carry no epoch arithmetic of their own.
 *  Two guarded files legitimately DO the inverse inline — `lib/dietTrialCard.ts`'s
 *  `formatTrialDate` and `generate-report/trial.ts` — and each carves it out with a
 *  comment; they keep the DAY_DIVISION check (the dangerous forward direction) but
 *  not this one. The lasting fix is the hoist: the single inverse now lives in
 *  `lib/utils.dayKeyFromIndex`, so a file that indexes days correctly imports it and
 *  contains neither operator. */
const DAY_MULTIPLICATION = /\*\s*(86_400_000|86400000|MS_PER_DAY|\(\s*1000\s*\*\s*60\s*\*\s*60\s*\*\s*24\s*\))/;

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

  // B-449 — the vet report's "Day N" was the FIFTH implementation of the counter, outside this
  // guard: a hand-rolled `Math.max(1, evidence.endDayIndex - ctx.startDayIndex + 1)`. It used
  // the oracle's day INDICES but re-spelled the day-1-inclusive subtraction, and "each
  // implementation independently happens to be right today" is precisely the state that precedes
  // drift. The subtraction now lives once, in `lib/utils.trialDayCounter`, so the report and the
  // canonical client counter share the arithmetic — the END index stays each caller's own
  // deliberate choice (client → today, report → evidence end), which is where they MUST differ.
  it('the vet report and the client oracle share the ONE Day N formula (B-449)', () => {
    expect(read('supabase/functions/generate-report/trial.ts')).toMatch(/trialDayCounter\(/);
    expect(read('lib/analytics.ts')).toMatch(/trialDayCounter\(/);
    // Neither re-spells the inline subtraction the extraction replaced.
    expect(readCode('supabase/functions/generate-report/trial.ts')).not.toMatch(
      /Math\.max\(\s*1\s*,\s*evidence\.endDayIndex\s*-\s*ctx\.startDayIndex\s*\+\s*1\s*\)/,
    );
    expect(readCode('lib/analytics.ts')).not.toMatch(
      /Math\.max\(\s*1\s*,\s*todayIndex\s*-\s*startIndex\s*\+\s*1\s*\)/,
    );
  });

  it('the ONE Day N formula is defined once in lib/utils, day-1-inclusive (B-449)', () => {
    const src = readCode('lib/utils.ts');
    expect(src).toMatch(/export function trialDayCounter\(/);
    // Floored at 1 — a trial is on its first day the moment it starts, never "day 0".
    expect(src).toMatch(/Math\.max\(1,/);
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

    // B-441 CLOSED. This screen's LAST day-arithmetic — the medication regimen
    // counter — moved to `lib/medications.regimenDaysElapsed` and now routes through
    // the same `localDayIndexOf` primitive, so the exemption these two assertions
    // used to carve out is gone and the screen holds NO day math at all.
    //
    // The assertions flipped from "exactly one is allowed" to "none are", which is
    // the only form that stays honest: a count-based allowance passes just as
    // happily when someone deletes the permitted one and adds a different one.
    expect(readCode('app/(tabs)/profile.tsx')).not.toMatch(DAY_DIVISION);
    expect(src).not.toMatch(MANUAL_MIDNIGHT);
    expect(src).not.toMatch(/function regimenDaysElapsed/);
    expect(src).toMatch(/regimenDaysElapsed\(/); // delegates to the shared helper

    // The same UTC-parse also lived in this screen's "Started <date>" fallback:
    // `new Date(<a date-only DATE>)` renders the PREVIOUS day behind UTC.
    expect(src).not.toMatch(/new Date\(reg\.started_at\)/);
    expect(readCode('app/(tabs)/profile.tsx')).toMatch(/dayKeyToLocalDate\(startedAt\)/);
  });

  it('the medication regimen counter indexes calendar days, never a ms span', () => {
    // B-441. The counter's own module: it may not reintroduce either failure mode,
    // and the header comment naming them is stripped by readCode so the prose does
    // not fail its own guard.
    const meds = readCode('lib/medications.ts');
    expect(meds).not.toMatch(DAY_DIVISION);
    expect(meds).not.toMatch(MANUAL_MIDNIGHT);
    expect(meds).toMatch(/localDayIndexOf\(/);
  });

  // The READ side above was guarded while the WRITE side stayed broken — and this
  // suite passed the whole time. `AddMedicationModal` was still writing
  // `startedAt.toISOString().split('T')[0]`, the UTC day, so an owner AHEAD of UTC
  // picking "today" stored YESTERDAY permanently; `handleEndRegimen` did the same to
  // `ended_at` fourteen lines below code the counter fix had just rewritten. A guard
  // that covers only the direction you happened to fix certifies the other by silence
  // — and a fixed reader fed by a broken writer is worse than neither, because the
  // reader now trusts the skew.
  //
  // So these forbid the two PATTERNS, not the past sightings. The assertion above,
  // `not.toMatch(/new Date\(reg\.started_at\)/)`, is bound to the identifier `reg`:
  // renaming it to `r` defeats the guard without touching the bug.
  const DATE_KEY_VIA_UTC = /\.toISOString\(\)\s*\.\s*(split\(\s*['"]T['"]\s*\)\s*\[\s*0\s*\]|slice\(\s*0\s*,\s*10\s*\))/;
  const DATE_COL_VIA_NEW_DATE = /new Date\(\s*[A-Za-z_$][\w$.]*\.(started_at|ended_at|completed_at)\s*\)/;

  const DATE_COLUMN_SURFACES = [
    { file: 'app/(tabs)/profile.tsx', what: 'the Pet tab (counter, Started line, End-regimen write)' },
    { file: 'components/profile/AddMedicationModal.tsx', what: 'the regimen setup modal (the WRITE path)' },
  ];

  it.each(DATE_COLUMN_SURFACES)('$what never round-trips a DATE column through UTC', ({ file }) => {
    const code = readCode(file);
    // Writing: a UTC day key from an instant. A DATE column is written with
    // `toLocalDayKey`, whose components are the owner's calendar day.
    expect(code).not.toMatch(DATE_KEY_VIA_UTC);
    // Reading: `new Date('2026-07-31')` is UTC midnight — the PREVIOUS local day
    // behind UTC. Stored day keys are parsed with `dayKeyToLocalDate`.
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

  it('the outcome-sheet loader indexes local days and carries no epoch math of its own (B-517)', () => {
    // The fourth day-math path B-421 was written to catch, and the one it MISSED.
    // B-417 PR 6 named this file as a consumer and then pinned it with value tests,
    // so its index→dayKey INVERSION (the headline PR-6 bug) was caught by review
    // rather than by this guard: the file was never on the list, and its private
    // `index * MS_PER_DAY` inverse evaded DAY_DIVISION, which matches division only.
    //
    // B-517 closes both holes at once. The epoch-day inverse moved to
    // `lib/utils.dayKeyFromIndex` (the single place `localDayIndexOf`'s inverse
    // lives), so this file now delegates the boundary in BOTH directions and holds
    // neither operator — and DAY_MULTIPLICATION below forbids the multiply from
    // creeping back, the check that would have caught PR 6 the first time.
    const src = readCode('lib/dietTrialOutcomeFacts.ts');
    expect(src).toMatch(/localDayIndexOf\(/);
    expect(src).toMatch(/dayKeyFromIndex\(/); // the shared inverse, imported not redefined
    expect(src).not.toMatch(/const MS_PER_DAY/);
    expect(src).not.toMatch(DAY_DIVISION);
    expect(src).not.toMatch(DAY_MULTIPLICATION);
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

  // B-539 — the SIXTH path, and the second one on the server boundary this guard reaches.
  // `resolveWindow`'s since_trial_start branch used a raw UTC `Math.floor`: its windowDays
  // disagreed with the card's Day N by ±1 for a device off UTC, and its retrieval lower bound
  // (UTC midnight of the start DATE) dropped the first hours of trial day 1 east of UTC. It now
  // lives in `resolveTrialWindow`, which derives its day indices from the SAME zoned helpers
  // dietTrialStatus uses and its [startMs, endMs) bounds from zonedDayStartMs — so it buckets by
  // the owner's midnight, never raw UTC. The fixed 7d/14d/30d windows deliberately STAY
  // UTC-aligned (calendarWindow parity), so this guards the trial branch's own function, not the
  // whole file.
  it('the since_trial_start window buckets by the owner timezone, not raw UTC (B-539)', () => {
    const tools = read('supabase/functions/ask/tools.ts');
    const fn = tools.slice(tools.indexOf('function resolveTrialWindow'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toMatch(/zonedDayIndexOf\(/);
    expect(body).toMatch(/zonedDayIndex\(/);
    expect(body).toMatch(/zonedDayStartMs\(/); // LOCAL-midnight retrieval bounds, not index*day
    expect(body).not.toMatch(DAY_DIVISION);
    // and the tool layer actually threads the owner zone into resolveWindow (not just the counter)
    expect(read('supabase/functions/ask/answer.ts')).toMatch(/trialStartMs:\s*ctx\.trialStartMs,\s*timezone:\s*ctx\.timezone/);
  });
});
